import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { emit } from "@/lib/sse-emitter";
import { isWithinBusinessHours } from "@/lib/business-hours";

const FOLLOWUP_MESSAGE =
  "Em que podemos lhe ajudar?\n\nSomos um escritório especializado em Direito Trabalhista, Previdenciário (INSS) e Acidente de Trabalho\n\nEnvie uma mensagem, por ESCRITO ou ÁUDIO, explicando o MOTIVO DO SEU CONTATO. Responderemos o mais rápido possível.";

// Roda a cada 30 minutos — dispara follow-up para conversas abandonadas entre 1h e 4h atrás
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const cutoffMin = new Date(now - 4 * 60 * 60_000); // 4h atrás
  const cutoffMax = new Date(now - 1 * 60 * 60_000); // 1h atrás

  // Busca conversas abertas com IA ativa, cuja última mensagem foi entre 1h e 4h atrás
  const candidates = await prisma.conversation.findMany({
    where: {
      aiEnabled: true,
      status: "OPEN",
      lastMessageAt: { gte: cutoffMin, lte: cutoffMax },
    },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Filtra somente conversas onde a última mensagem foi da IA (cliente não respondeu)
  const abandoned = candidates.filter(conv => {
    const last = conv.messages[0];
    return last && last.direction === "OUTBOUND" && last.isAI;
  });

  let sent = 0;
  let skippedOffHours = 0;
  const errors: string[] = [];
  // Cache por org: o loop costuma repetir a mesma organização muitas vezes.
  const businessHoursCache = new Map<string, boolean>();

  for (const conv of abandoned) {
    const phone = conv.phoneNumber.startsWith("lid:") ? "" : conv.phoneNumber;
    const chatLid = (conv as any).chatLid ?? null;

    if (!phone && !chatLid) continue;

    // Follow-up é mensagem não solicitada: nunca mandar fora do expediente.
    // Cliente recebendo mensagem do escritório de madrugada achou que o
    // telefone da doutora tinha sido clonado.
    let open = businessHoursCache.get(conv.organizationId);
    if (open === undefined) {
      open = await isWithinBusinessHours(conv.organizationId);
      businessHoursCache.set(conv.organizationId, open);
    }
    if (!open) {
      skippedOffHours++;
      continue;
    }

    try {
      // Salva a mensagem de follow-up no banco
      const msg = await prisma.message.create({
        data: {
          conversationId: conv.id,
          content: FOLLOWUP_MESSAGE,
          direction: "OUTBOUND",
          status: "SENT",
          isAI: true,
        },
      });

      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: new Date(),
        },
      });

      emit(conv.organizationId, "message", { conversationId: conv.id, message: msg });

      await sendWhatsAppMessage(conv.organizationId, phone, FOLLOWUP_MESSAGE, chatLid);
      sent++;
    } catch (err) {
      errors.push(`conv ${conv.id}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, sent, skippedOffHours, errors });
}
