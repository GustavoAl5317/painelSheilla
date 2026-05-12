import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/ai/lead-qualifier";
import { transcribeAudio, analyzeMediaWithAI } from "@/lib/ai/ai-service";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { isPhoneBlocked } from "@/lib/blocked-phones";
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

  // LOG TEMPORÁRIO — remover após diagnóstico
  console.log("[webhook] RAW BODY:", JSON.stringify(body, null, 2));

  const parsed = parseWhatsAppWebhookBody(body);
  if ("skip" in parsed) {
    console.log("[webhook] skipped:", parsed.reason, "| type:", body.type, "| fromMe:", body.fromMe);
    return NextResponse.json({ ok: true, ignored: parsed.reason });
  }

  // LOG TEMPORÁRIO — remover após diagnóstico
  console.log("[webhook] parsed:", JSON.stringify({ messageType: parsed.messageType, imageUrl: parsed.imageUrl, documentUrl: parsed.documentUrl, content: parsed.content?.slice(0, 100), fromMe: parsed.fromMe }));

  // ── Busca configuração de IA (necessária para comandos do operador e bloqueios) ──
  const aiConfig = await prisma.aIConfig.findUnique({
    where: { organizationId: org.id },
  });

  const phoneNumber = parsed.phone;
  const chatLid = parsed.chatLid;
  let messageContent = parsed.content;
  const externalMessageId = parsed.externalMessageId;
  const messageType = parsed.messageType;
  const audioUrl = parsed.audioUrl;
  const imageUrl = parsed.imageUrl;
  const documentUrl = parsed.documentUrl;
  const documentName = parsed.documentName;

  // ── Verifica bloqueio em massa ──────────────────────────────────────────
  const blockedList = (aiConfig as any)?.blockedNumbers;
  if (
    isPhoneBlocked(blockedList, phoneNumber) ||
    (chatLid && isPhoneBlocked(blockedList, chatLid))
  ) {
    return NextResponse.json({ ok: true, ignored: "mass_blocked_number" });
  }

  const openaiKey = await resolveCredential(org.id, "OPENAI_API_KEY") ?? aiConfig?.apiKey ?? null;
  const hasMedia = !!(imageUrl || documentUrl);

  // ── Busca ou cria conversa (atômico — evita race condition de duplicata) ──
  // Identifica por chatLid primeiro (estável p/ contatos LID) e depois por phoneNumber.
  let conversation = chatLid
    ? await prisma.conversation.findFirst({
        where: { organizationId: org.id, chatLid },
      })
    : null;
  if (!conversation && phoneNumber) {
    conversation = await prisma.conversation.findFirst({
      where: { organizationId: org.id, phoneNumber },
    });
  }

  // Conversa já existia mas faltava info (ex.: tinha só chatLid e agora veio o
  // telefone real, ou vice-versa). Completa o registro.
  if (conversation) {
    const updates: { phoneNumber?: string; chatLid?: string } = {};
    if (phoneNumber && conversation.phoneNumber !== phoneNumber && (conversation.phoneNumber.startsWith("lid:") || conversation.phoneNumber === "")) {
      updates.phoneNumber = phoneNumber;
    }
    if (chatLid && (conversation as any).chatLid !== chatLid) {
      updates.chatLid = chatLid;
    }
    if (Object.keys(updates).length > 0) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: updates,
      }).catch(() => conversation);
    }
  }

  if (!conversation) {
    const lookupPhone = phoneNumber || `lid:${chatLid}`;
    const displayName = phoneNumber || chatLid || lookupPhone;
    const [defaultStage, formerClient] = await Promise.all([
      prisma.kanbanStage.findFirst({ where: { organizationId: org.id, slug: "new_lead" } }),
      phoneNumber
        ? prisma.client.findFirst({ where: { organizationId: org.id, phone: phoneNumber }, select: { name: true } })
        : Promise.resolve(null),
    ]);

    const lead = await prisma.lead.create({
      data: {
        name: formerClient?.name ?? displayName,
        phone: phoneNumber || null,
        source: "WHATSAPP",
        organizationId: org.id,
        stageId: defaultStage?.id,
      },
    });

    try {
      conversation = await prisma.conversation.create({
        data: {
          phoneNumber: phoneNumber || `lid:${chatLid}`,
          chatLid: chatLid ?? null,
          organizationId: org.id,
          leadId: lead.id,
          status: "OPEN",
          aiEnabled: true,
          lastMessageAt: new Date(),
        },
      });
    } catch (e: any) {
      // Unique constraint: outra requisição criou a conversa em paralelo — busca a existente
      if (e?.code === "P2002") {
        conversation = chatLid
          ? await prisma.conversation.findFirst({ where: { organizationId: org.id, chatLid } })
          : null;
        if (!conversation && phoneNumber) {
          conversation = await prisma.conversation.findFirst({
            where: { organizationId: org.id, phoneNumber },
          });
        }
        await prisma.lead.delete({ where: { id: lead.id } }).catch(() => {});
      }
      if (!conversation) throw e;
    }
  }

  // ── Verifica se o contato está bloqueado ──────────────────────────────────
  if ((conversation as any).isBlocked) {
    return NextResponse.json({ ok: true, ignored: "blocked_contact" });
  }

  // ── Vincula conversa a Cliente existente pelo telefone ────────────────────
  if (!conversation.clientId && phoneNumber) {
    const clientId = await findClientIdByOrgPhone(org.id, phoneNumber);
    if (clientId) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { clientId },
      });
    }
  }

  // ── Mensagens do operador: trata antes de salvar ─────────────────────────
  console.log(`[webhook] fromMe=${parsed.fromMe} content="${messageContent.slice(0, 20)}"`);
  if (parsed.fromMe) {
    const cmd = messageContent.trim();

    // Echo da própria IA — escopo: somente mensagens IA na MESMA conversa, janela de 60s.
    // Comandos "#" e "." são checados ANTES para garantir que nunca sejam tratados
    // como echo (mesmo no caso improvável da IA ter enviado esse texto).
    const isCommand = cmd === "#" || cmd === ".";
    if (!isCommand) {
      const aiEchoWindow = new Date(Date.now() - 60_000);
      const recentAiMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id, isAI: true, createdAt: { gte: aiEchoWindow } },
        select: { content: true },
      });
      const normalizeMsg = (s: string) => s.replace(/\s+/g, " ").trim();
      const normalizedIncoming = normalizeMsg(messageContent);
      const isAiEcho = recentAiMessages.some(m => normalizeMsg(m.content) === normalizedIncoming);
      if (isAiEcho) {
        console.log(`[webhook] echo da IA ignorado (conv=${conversation.id})`);
        return NextResponse.json({ ok: true, ignored: "ai_echo" });
      }
    }

    // "." → reativa IA, não salva nem envia ao cliente
    if (cmd === ".") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { aiEnabled: true, operatorLastMessageAt: new Date() },
      });
      console.log(`[webhook] operador reativou IA (conv=${conversation.id})`);
      return NextResponse.json({ ok: true, ignored: "ai_resumed" });
    }

    // "#" ou palavra-chave customizada → pausa IA, não salva nem aparece no chat
    const customKeyword = (aiConfig as any)?.operatorKeyword?.trim();
    if (cmd === "#" || (customKeyword && cmd.toLowerCase() === customKeyword.toLowerCase())) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { aiEnabled: false, operatorLastMessageAt: new Date() },
      });
      console.log(`[webhook] operador pausou IA (conv=${conversation.id}, cmd="${cmd}")`);
      return NextResponse.json({ ok: true, ai_paused: true });
    }

    // Mensagem normal do operador — pausa IA e salva no chat
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { operatorLastMessageAt: new Date(), aiEnabled: false },
    });
  }

  // ── Transcreve áudio / analisa mídia (somente mensagens do cliente) ─────────
  if (!parsed.fromMe) {
    if (messageType === "AUDIO" && audioUrl && openaiKey) {
      const transcription = await transcribeAudio(audioUrl, openaiKey);
      if (transcription) messageContent = transcription;
    } else if ((messageType === "IMAGE" || messageType === "DOCUMENT") && (imageUrl || documentUrl) && openaiKey) {
      const mediaUrl = (messageType === "IMAGE" ? imageUrl : documentUrl)!;
      const mediaType = messageType === "IMAGE" ? "image" : "document";
      const analysis = await analyzeMediaWithAI(mediaUrl, mediaType, openaiKey);
      if (analysis) {
        messageContent = `[Arquivo recebido: ${documentName || "mídia"}]\nConteúdo analisado pela IA: ${analysis}`;
      }
    }
  }

  // ── Salva mensagem (idempotência por externalId ou conteúdo recente) ───────
  if (externalMessageId) {
    const existing = await prisma.message.findFirst({
      where: { externalId: externalMessageId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }
  } else {
    // Sem externalId: dedup só dentro da MESMA conversa (phoneNumber implícito) e
    // janela curta de 5s, suficiente para retentativas de webhook do provider mas
    // permitindo operadora repetir mensagem legítima após poucos segundos.
    const dedupeWindow = new Date(Date.now() - 5_000);
    const existing = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        content: messageContent,
        direction: parsed.fromMe ? "OUTBOUND" : "INBOUND",
        createdAt: { gte: dedupeWindow },
      },
      select: { id: true },
    });
    if (existing) {
      console.log(`[webhook] mensagem duplicada descartada (conv=${conversation.id}, phone=${phoneNumber})`);
      return NextResponse.json({ ok: true, ignored: "duplicate_content" });
    }
  }

  const msg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      content: messageContent,
      type: messageType as "TEXT" | "IMAGE" | "AUDIO",
      direction: parsed.fromMe ? "OUTBOUND" : "INBOUND",
      status: "READ",
      externalId: externalMessageId,
      mediaUrl: audioUrl,
      isAI: false,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      unreadCount: parsed.fromMe ? undefined : { increment: 1 },
      status: parsed.fromMe ? "IN_PROGRESS" : "OPEN"
    },
  });

  emit(org.id, "message", { conversationId: conversation.id, message: msg });

  // Mensagem normal do operador já foi tratada acima — para aqui
  if (parsed.fromMe) {
    return NextResponse.json({ ok: true, ignored: "fromMe_processed" });
  }

  // ── Processa com IA (somente se aiEnabled) ────────────────────────────────
  // Marca o momento em que a mensagem do cliente chegou — usado depois para detectar intervenção do operador
  const clientMessageReceivedAt = new Date();

  // Busca status atualizado do banco para evitar race conditions com mensagens do operador
  const freshConv = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { aiEnabled: true, operatorLastMessageAt: true },
  });

  if (!freshConv?.aiEnabled) {
    console.log(`[Webhook] AI ignorada para ${phoneNumber}: conversa com IA desativada (check final).`);
    return NextResponse.json({ ok: true, ai: "disabled" });
  }

  console.log(`[Webhook] Processando mensagem com IA para ${phoneNumber}...`);
  let aiResult: Awaited<ReturnType<typeof processIncomingMessage>> = null;
  let aiError: Error | null = null;
  try {
    aiResult = await processIncomingMessage(org.id, conversation.id, messageContent, hasMedia, msg.id);
  } catch (err) {
    aiError = err as Error;
    console.error(`[Webhook] processIncomingMessage falhou:`, aiError.message);
  }

  if (!aiResult) {
    console.log(`[Webhook] AI não retornou resultado (Configuração inativa ou erro no provider).`);

    // Notifica operador para que a mensagem do cliente não fique sem resposta silenciosamente.
    // Só cria a notificação se a IA estava ativa (caso contrário, é normal não responder).
    if (freshConv?.aiEnabled) {
      const preview = messageContent.length > 80 ? messageContent.slice(0, 80) + "…" : messageContent;
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          type: "NEW_MESSAGE",
          title: "IA não respondeu — verificar conversa",
          message: `Cliente ${phoneNumber} enviou: "${preview}". A IA não retornou resposta${aiError ? ` (${aiError.message})` : ""}.`,
          metadata: { conversationId: conversation.id, error: aiError?.message ?? null },
        },
      }).catch(e => console.error("[webhook] falha ao criar notification:", e));
    }

    return NextResponse.json({ ok: true, ai: "no_result" });
  }

  if (aiResult?.content) {
    // Verifica se o operador respondeu enquanto a IA estava processando
    const convAfterAI = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { aiEnabled: true, operatorLastMessageAt: true },
    });

    const operatorRespondedDuringAI =
      convAfterAI?.operatorLastMessageAt &&
      convAfterAI.operatorLastMessageAt > clientMessageReceivedAt;

    if (!convAfterAI?.aiEnabled || operatorRespondedDuringAI) {
      console.log(`[Webhook] AI bloqueada para ${phoneNumber}: operador respondeu durante processamento.`);
      return NextResponse.json({ ok: true, ai: "blocked_by_operator" });
    }

    // Dedup de resposta da IA: evita envio duplo quando dois webhooks chegam em paralelo
    // (ex: cliente envia PDF + ZIP juntos — Z-API dispara dois eventos quase simultâneos).
    const recentAiReply = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        isAI: true,
        createdAt: { gte: new Date(clientMessageReceivedAt.getTime() - 15_000) },
      },
      select: { id: true },
    });
    if (recentAiReply) {
      console.log(`[Webhook] Resposta da IA suprimida para ${phoneNumber}: já foi respondido nos últimos 15s.`);
      return NextResponse.json({ ok: true, ai: "suppressed_duplicate" });
    }

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
      await sendWhatsAppMessage(org.id, phoneNumber, aiResult.content, chatLid);
    } catch (err) {
      console.error("[webhook] Falha ao enviar mensagem WhatsApp:", (err as Error).message);
    }
  }

  return NextResponse.json({ ok: true });
}
