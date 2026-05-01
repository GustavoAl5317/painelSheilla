import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";

const bodySchema = z.object({
  content: z.string().min(1).max(4000),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: conversationId } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: orgId },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ data: messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: conversationId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });
  }

  const { content } = parsed.data;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: orgId },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  if (conversation.isBlocked) {
    return NextResponse.json({ error: "Contato bloqueado" }, { status: 403 });
  }

  const aiConfig = await prisma.aIConfig.findUnique({ where: { organizationId: orgId } });
  const blockedList = (aiConfig as any)?.blockedNumbers;
  if (Array.isArray(blockedList) && blockedList.some((item: any) => {
    const p = String(item.phone || "").replace(/\D/g, "");
    const convP = conversation.phoneNumber.replace(/\D/g, "");
    return p === convP;
  })) {
    return NextResponse.json({ error: "Contato bloqueado" }, { status: 403 });
  }

  try {
    await sendWhatsAppMessage(orgId, conversation.phoneNumber, content);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao enviar no WhatsApp";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        conversationId,
        content,
        type: "TEXT",
        direction: "OUTBOUND",
        status: "SENT",
        isAI: false,
      },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), status: "OPEN" },
    });
    return msg;
  });

  return NextResponse.json({ data: message });
}
