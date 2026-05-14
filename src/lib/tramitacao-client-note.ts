import "server-only";
import { prisma } from "@/lib/prisma";

const TRAMITACAO_NOTE_MAX_CHARS = 14_000;

export type TramitacaoNoteClientFields = {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

/** Texto para anexar à nota da TI: resumos de lead/IA, entrada do cartão do caso e trecho do WhatsApp. */
export async function buildConversationSummaryForTramitacaoNote(
  organizationId: string,
  clientId: string
): Promise<string> {
  const sections: string[] = [];

  const cardEntry = await prisma.caseCardEntry.findFirst({
    where: {
      card: { organizationId, clientId },
      content: { contains: "Resumo do atendimento (gerado pela IA" },
    },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  if (cardEntry?.content?.trim()) {
    sections.push(cardEntry.content.trim());
  }

  const leads = await prisma.lead.findMany({
    where: { organizationId, clientId },
    select: { legalArea: true, caseSummary: true, aiSummary: true },
  });

  const seenLeadLine = new Set<string>();
  const pushLine = (line: string) => {
    const t = line.trim();
    if (!t || seenLeadLine.has(t)) return;
    seenLeadLine.add(t);
    sections.push(t);
  };

  for (const lead of leads) {
    if (lead.legalArea) pushLine(`Área jurídica: ${lead.legalArea}`);
    if (lead.caseSummary) pushLine(`Resumo do caso (IA): ${lead.caseSummary}`);
    if (lead.aiSummary) pushLine(`Qualificação / observações (IA): ${lead.aiSummary}`);
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      organizationId,
      OR: [{ clientId }, { lead: { clientId } }],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 3,
    select: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 60,
        select: { content: true, direction: true, isAI: true, createdAt: true },
      },
    },
  });

  type MsgLine = { at: number; text: string };
  const msgLines: MsgLine[] = [];
  for (const c of conversations) {
    for (const m of c.messages) {
      const role = m.direction === "INBOUND" ? "Cliente" : m.isAI ? "IA" : "Atendente";
      msgLines.push({ at: m.createdAt.getTime(), text: `[${role}] ${m.content}` });
    }
  }
  msgLines.sort((a, b) => a.at - b.at);
  const tail = msgLines.slice(-80);
  if (tail.length) {
    sections.push("Histórico recente do WhatsApp:", ...tail.map(m => m.text));
  }

  const out = sections.join("\n").trim();
  if (!out) return "";
  if (out.length <= TRAMITACAO_NOTE_MAX_CHARS) return out;
  return `${out.slice(0, TRAMITACAO_NOTE_MAX_CHARS)}\n…(texto truncado para limite da nota na TI)`;
}

/** Conteúdo completo da nota de triagem enviada à Tramitação Inteligente. */
export async function buildTramitacaoTriageNoteContent(
  client: TramitacaoNoteClientFields,
  organizationId: string
): Promise<string> {
  const conversationBlock = await buildConversationSummaryForTramitacaoNote(organizationId, client.id);
  const parts = [
    `Nome: ${client.name}`,
    `CPF: ${client.cpf ?? "Não informado"}`,
    `Telefone: ${client.phone ?? "Não informado"}`,
    `E-mail: ${client.email ?? "Não informado"}`,
    client.notes ? `\nNotas: ${client.notes}` : "",
    conversationBlock ? `\n---\nResumo / conversa (Painel)\n${conversationBlock}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}
