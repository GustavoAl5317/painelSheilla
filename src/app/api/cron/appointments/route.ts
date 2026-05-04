import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";

// Roda a cada hora — envia lembrete 24h e 1h antes do agendamento
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Janelas: entre 23h e 25h a partir de agora (lembrete de 24h)
  // e entre 50min e 70min (lembrete de 1h)
  const windows = [
    { label: "24h", from: addMinutes(now, 23 * 60), to: addMinutes(now, 25 * 60) },
    { label: "1h", from: addMinutes(now, 50), to: addMinutes(now, 70) },
  ];

  let sent = 0;
  const errors: string[] = [];

  for (const window of windows) {
    const appointments = await prisma.appointment.findMany({
      where: {
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        notifyClient: true,
        reminderSent: false,
        date: { gte: window.from, lte: window.to },
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    for (const appt of appointments) {
      if (!appt.client?.phone) continue;

      const firstName = appt.client.name.split(" ")[0];
      const dateStr = appt.date.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const message =
        window.label === "24h"
          ? `📅 *Lembrete de Agendamento*\n\nOlá, ${firstName}! Você tem um agendamento amanhã:\n\n*${appt.title}*\n📆 ${dateStr}${appt.description ? `\n\n${appt.description}` : ""}\n\nQualquer dúvida, estamos à disposição!`
          : `⏰ *Seu agendamento é em 1 hora!*\n\nOlá, ${firstName}! Lembre-se:\n\n*${appt.title}*\n📆 ${dateStr}${appt.description ? `\n\n${appt.description}` : ""}\n\nAté logo!`;

      try {
        await sendWhatsAppMessage(appt.organizationId, appt.client.phone, message);
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSent: true },
        });
        sent++;
      } catch (err) {
        errors.push(`${appt.id}: ${(err as Error).message}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
