import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/ai/lead-qualifier";
import { transcribeAudio } from "@/lib/ai/ai-service";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { parseWhatsAppWebhookBody } from "./parse-payload";
import { findClientIdByOrgPhone } from "@/lib/phone-link-client";
import { emit } from "@/lib/sse-emitter";
import { resolveCredential } from "@/lib/credentials";

export async function POST(req: NextRequest) {
  const orgSlug = req.nextUrl.searchParams.get("org");
  if (!orgSlug) return NextResponse.json({ error: "org é obrigatório" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = parseWhatsAppWebhookBody(body);
  if ("skip" in parsed) {
    // 200: Z-API e similares reintentam se não for sucesso — evita flood de 400 em fromMe / mídia sem texto / eventos vazios
    return NextResponse.json({ ok: true, ignored: parsed.reason });
  }

  const phoneNumber = parsed.phone;
  let messageContent = parsed.content;
  const externalMessageId = parsed.externalMessageId;
  const messageType = parsed.messageType;
  const audioUrl = parsed.audioUrl;

  // ── Verifica bloqueio em massa ──────────────────────────────────────────
  const aiConfig = await prisma.aIConfig.findUnique({
    where: { organizationId: org.id }
  });
  const blockedList = (aiConfig as any)?.blockedNumbers;
  if (Array.isArray(blockedList) && blockedList.some((item: any) => item.phone === phoneNumber)) {
    return NextResponse.json({ ok: true, ignored: "mass_blocked_number" });
  }

  // ── Transcreve áudio antes de qualquer processamento ─────────────────────
  if (messageType === "AUDIO" && audioUrl) {
    const openaiKey = await resolveCredential(org.id, "OPENAI_API_KEY") ?? aiConfig?.apiKey ?? null;
    if (openaiKey) {
      const transcription = await transcribeAudio(audioUrl, openaiKey);
      if (transcription) {
        messageContent = transcription;
      }
    }
  }

  // ── Busca ou cria conversa ────────────────────────────────────────────────
  let conversation = await prisma.conversation.findFirst({
    where: { phoneNumber, organizationId: org.id },
  });

  if (!conversation) {
    const defaultStage = await prisma.kanbanStage.findFirst({
      where: { organizationId: org.id, slug: "new_lead" },
    });

    const lead = await prisma.lead.create({
      data: {
        name: phoneNumber,
        phone: phoneNumber,
        source: "WHATSAPP",
        organizationId: org.id,
        stageId: defaultStage?.id,
      },
    });

    conversation = await prisma.conversation.create({
      data: {
        phoneNumber,
        organizationId: org.id,
        leadId: lead.id,
        status: "OPEN",
        aiEnabled: true,
        lastMessageAt: new Date(),
      },
    });
  }

  // ── Verifica se o contato está bloqueado ──────────────────────────────────
  if ((conversation as any).isBlocked) {
    return NextResponse.json({ ok: true, ignored: "blocked_contact" });
  }

  // ── Vincula conversa a Cliente existente pelo telefone ────────────────────
  if (!conversation.clientId) {
    const clientId = await findClientIdByOrgPhone(org.id, phoneNumber);
    if (clientId) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { clientId },
      });
    }
  }

  // ── Salva mensagem recebida (idempotência por externalId) ────────────────
  if (externalMessageId) {
    const existing = await prisma.message.findFirst({
      where: { externalId: externalMessageId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }
  }

  const inboundMsg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      content: messageContent,
      type: messageType as "TEXT" | "IMAGE" | "AUDIO",
      direction: "INBOUND",
      status: "READ",
      externalId: externalMessageId,
      mediaUrl: audioUrl,
      isAI: false,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), unreadCount: { increment: 1 }, status: "OPEN" },
  });

  emit(org.id, "message", { conversationId: conversation.id, message: inboundMsg });

  // ── Processa com IA (somente se aiEnabled) ────────────────────────────────
  if (!conversation.aiEnabled) {
    return NextResponse.json({ ok: true, ai: "disabled" });
  }

  const aiResult = await processIncomingMessage(org.id, conversation.id, messageContent);

  if (aiResult?.content) {
    const aiMsg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        content: aiResult.content,
        direction: "OUTBOUND",
        status: "SENT",
        isAI: true,
      },
    });

    emit(org.id, "message", { conversationId: conversation.id, message: aiMsg });

    try {
      await sendWhatsAppMessage(org.id, phoneNumber, aiResult.content);
    } catch (err) {
      console.error("[webhook] Falha ao enviar mensagem WhatsApp:", (err as Error).message);
    }
  }

  return NextResponse.json({ ok: true });
}
