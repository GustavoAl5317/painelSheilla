import { prisma } from "@/lib/prisma";

// Horário do escritório. Os campos já existiam em Organization (e na tela de
// Configurações), mas nenhum código de atendimento os lia: o follow-up e os
// avisos de movimentação saíam a qualquer hora, inclusive de madrugada, o que
// assustou clientes da Dra. Sheila.
//
// Vale apenas para mensagem que o sistema envia por conta própria. Resposta a
// quem acabou de escrever não passa por aqui: se o cliente manda mensagem
// às 21h, responder é o certo.

const TZ = "America/Sao_Paulo";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Dia da semana (0=domingo) e minutos desde a meia-noite, no fuso do escritório. */
function nowInOfficeTz(): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";

  return {
    day: WEEKDAY_INDEX[get("weekday")] ?? new Date().getDay(),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** "08:00" -> 480. Valor inválido cai no fallback. */
function parseHHMM(value: string | null | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return fallback;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return fallback;
  return hour * 60 + minute;
}

/**
 * Estamos dentro do expediente da organização?
 * Config ausente ou inválida devolve true — nunca bloqueia envio por engano.
 */
export async function isWithinBusinessHours(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { businessHoursStart: true, businessHoursEnd: true, businessDays: true },
  });
  if (!org) return true;

  const { day, minutes } = nowInOfficeTz();

  const days = (org.businessDays ?? "")
    .split(",")
    .map(s => Number.parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  if (days.length > 0 && !days.includes(day)) return false;

  const start = parseHHMM(org.businessHoursStart, 8 * 60);
  const end = parseHHMM(org.businessHoursEnd, 18 * 60);
  if (end <= start) return true;

  return minutes >= start && minutes < end;
}
