import "server-only";
import type { CaseCardEntrySource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { summarizeCaseCardForWhatsApp } from "@/lib/ai/ai-service";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { trelloAppendPlainComment } from "@/lib/adapters/trello-adapter";
const NOTIFY_COOLDOWN_MS = 90_000;

export async function ensureClientCaseCard(organizationId: string, clientId: string) {
  const existing = await prisma.clientCaseCard.findUnique({ where: { clientId } });
  if (existing) return existing;
  return prisma.clientCaseCard.create({
    data: { organizationId, clientId },
  });
}

function formatEntryLine(
  source: CaseCardEntrySource,
  createdAt: Date,
  content: string
): string {
  const d = createdAt.toLocaleString("pt-BR");
  const tag =
    source === "DJEN"
      ? "DJEN"
      : source === "PJE"
        ? "PJe"
        : source === "COMMENT"
          ? "Comentário"
          : "Sistema";
  return `[${tag} · ${d}]\n${content}`;
}

export interface AppendEntryInput {
  source: CaseCardEntrySource;
  content: string;
  shareWithClient?: boolean;
  /** Para DJEN/PJe: só registra se o cartão estiver vinculado a este processo (ou cartão ainda sem processo = não aplica) */
  processId?: string | null;
}

/**
 * Adiciona linha ao cartão. Opcionalmente notifica o cliente (WhatsApp) com resumo por IA
 * só do que está no cartão (entradas com shareWithClient), se processo vinculado e conversa.
 */
export async function appendCaseCardEntry(
  organizationId: string,
  clientId: string,
  input: AppendEntryInput
): Promise<{ entryId: string | null; notified: boolean }> {
  const card = await ensureClientCaseCard(organizationId, clientId);

  if ((input.source === "DJEN" || input.source === "PJE") && input.processId && card.processId && card.processId !== input.processId) {
    return { entryId: null, notified: false };
  }

  const shareWithClient =
    input.shareWithClient ?? (input.source !== "COMMENT");

  const entry = await prisma.caseCardEntry.create({
    data: {
      cardId: card.id,
      source: input.source,
      content: input.content,
      shareWithClient,
    },
  });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { trelloCardId: true, name: true },
  });
  if (client?.trelloCardId) {
    const line = formatEntryLine(input.source, entry.createdAt, input.content);
    trelloAppendPlainComment(organizationId, client.trelloCardId, line).catch(() => {});
  }

  const notified = await maybeNotifyClientFromCaseCard(organizationId, card.id, client?.name ?? "Cliente");
  return { entryId: entry.id, notified };
}

async function maybeNotifyClientFromCaseCard(
  organizationId: string,
  cardId: string,
  clientName: string
): Promise<boolean> {
  const card = await prisma.clientCaseCard.findFirst({
    where: { id: cardId, organizationId },
    include: {
      entries: { orderBy: { createdAt: "asc" } },
      client: {
        include: {
          conversations: { take: 1, orderBy: { lastMessageAt: "desc" } },
        },
      },
    },
  });
  if (!card?.processId) return false;
  if (card.sendUpdates === false) return false;

  const shareEntries = card.entries.filter(e => e.shareWithClient);
  if (shareEntries.length === 0) return false;

  const conv = card.client.conversations[0];
  if (!conv) return false;

  if (
    card.lastNotifiedAt &&
    Date.now() - card.lastNotifiedAt.getTime() < NOTIFY_COOLDOWN_MS
  ) {
    return false;
  }

  const aiConfig = await prisma.aIConfig.findUnique({ where: { organizationId } });
  if (!aiConfig?.isActive) return false;

  const provider: "openai" | "anthropic" = aiConfig.provider === "ANTHROPIC" ? "anthropic" : "openai";
  const credKey = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const orgKey = await resolveCredential(organizationId, credKey);
  const apiKey = orgKey ?? aiConfig.apiKey ?? "";
  if (!apiKey) return false;

  const text = shareEntries
    .map(e => formatEntryLine(e.source, e.createdAt, e.content))
    .join("\n\n---\n\n");

  const firstName = clientName.split(" ")[0] ?? clientName;
  let message: string;
  try {
    message = await summarizeCaseCardForWhatsApp(
      text,
      firstName,
      apiKey,
      provider,
      aiConfig.model ?? undefined
    );
  } catch (err) {
    console.error("[case-card] summarize failed:", (err as Error).message);
    return false;
  }

  if (!message?.trim()) return false;

  try {
    await sendWhatsAppMessage(organizationId, conv.phoneNumber, `📋 *Atualização do seu caso*\n\n${message}`);
    // Pausa a IA na conversa — atualização vinda do escritório, não da IA.
    // Evita que a IA responda em paralelo gerando mensagens conflitantes.
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { aiEnabled: false, operatorLastMessageAt: new Date() },
    });
  } catch (err) {
    console.error("[case-card] WhatsApp failed:", (err as Error).message);
    return false;
  }

  await prisma.clientCaseCard.update({
    where: { id: cardId },
    data: { lastNotifiedAt: new Date() },
  });

  return true;
}

/** Chamado após vincular processo, para reavaliar envio. */
export async function notifyClientCaseCardIfReady(organizationId: string, clientId: string) {
  const card = await prisma.clientCaseCard.findUnique({
    where: { clientId },
  });
  if (!card) return false;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  return maybeNotifyClientFromCaseCard(organizationId, card.id, client?.name ?? "Cliente");
}
