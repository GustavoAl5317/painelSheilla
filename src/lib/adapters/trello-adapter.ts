import "server-only";
import { resolveCredential } from "@/lib/credentials";
import type { CRMAdapter, CRMLeadPayload, CRMTaskPayload, CRMCommentPayload } from "./crm-adapter";

const BASE = "https://api.trello.com/1";

// ─── Adapter CRM genérico (interface interna do AdvZap) ───────────────────────

interface TrelloConfig {
  apiKey: string;
  token: string;
  boardId: string;
  listId: string;
}

export class TrelloAdapter implements CRMAdapter {
  name = "Trello";
  private config: TrelloConfig;

  constructor(config: TrelloConfig) {
    this.config = config;
  }

  async createLead(lead: CRMLeadPayload) {
    const { apiKey, token, listId } = this.config;
    const res = await fetch(
      `${BASE}/cards?key=${apiKey}&token=${token}&idList=${listId}&name=${encodeURIComponent(lead.name)}&desc=${encodeURIComponent(lead.caseSummary ?? "")}&pos=top`,
      { method: "POST" }
    );
    const data = await res.json();
    return { externalId: data.id };
  }

  async updateLead(externalId: string, lead: Partial<CRMLeadPayload>) {
    const { apiKey, token } = this.config;
    const params = new URLSearchParams({ key: apiKey, token });
    if (lead.name) params.set("name", lead.name);
    if (lead.caseSummary) params.set("desc", lead.caseSummary);
    await fetch(`${BASE}/cards/${externalId}?${params}`, { method: "PUT" });
  }

  async createTask(task: CRMTaskPayload) {
    const { apiKey, token } = this.config;
    // Cria checklist item se tiver um cardId; senão cria um card separado
    const res = await fetch(
      `${BASE}/cards?key=${apiKey}&token=${token}&idList=${this.config.listId}&name=${encodeURIComponent(task.title)}&pos=bottom`,
      { method: "POST" }
    );
    const data = await res.json();
    return { externalId: data.id };
  }

  async addComment(comment: CRMCommentPayload) {
    const { apiKey, token } = this.config;
    await fetch(
      `${BASE}/cards/${comment.entityId}/actions/comments?key=${apiKey}&token=${token}&text=${encodeURIComponent(comment.content)}`,
      { method: "POST" }
    );
  }

  async syncStatus(externalId: string) {
    const { apiKey, token } = this.config;
    const res = await fetch(`${BASE}/cards/${externalId}?key=${apiKey}&token=${token}`);
    const data = await res.json();
    return { status: data.closed ? "done" : "in_progress" };
  }
}

// ─── Funções de sync de cliente (fluxo da Sheila) ────────────────────────────

export interface TrelloClientCardInput {
  name: string;
  contactNumber: string;
  cpf?: string;
  email?: string;
  legalArea?: string;
  notes?: string;
  tramitacaoCustomerId?: number;
}

async function getCreds(organizationId: string) {
  const [key, token, boardId, listId] = await Promise.all([
    resolveCredential(organizationId, "TRELLO_KEY"),
    resolveCredential(organizationId, "TRELLO_TOKEN"),
    resolveCredential(organizationId, "TRELLO_BOARD_ID"),
    resolveCredential(organizationId, "TRELLO_LIST_ID"),
  ]);
  if (!key || !token) throw new Error("Credenciais do Trello não configuradas.");
  return { key, token, boardId: boardId ?? "", listId: listId ?? "" };
}

async function getBoardLabels(boardId: string, key: string, token: string) {
  const res = await fetch(`${BASE}/boards/${boardId}/labels?key=${key}&token=${token}`);
  if (!res.ok) return [] as { id: string; name: string }[];
  return res.json() as Promise<{ id: string; name: string }[]>;
}

async function findCardByPhone(phone: string, boardId: string, key: string, token: string) {
  const clean = phone.replace(/\D/g, "");
  const terms = [clean, clean.startsWith("55") ? clean.slice(2) : clean, clean.slice(-9)];

  for (const term of terms) {
    const res = await fetch(
      `${BASE}/search?key=${key}&token=${token}&query=${term}&modelTypes=cards&idBoards=${boardId}&partial=true`
    );
    if (!res.ok) continue;
    const data = await res.json();
    const cards = (data.cards ?? []) as { id: string; name: string; shortUrl: string }[];
    const match = cards.find(c => c.name.replace(/\D/g, "").includes(term));
    if (match) return match;
  }
  return null;
}

function buildDesc(input: TrelloClientCardInput): string {
  const tiLink = input.tramitacaoCustomerId
    ? `https://planilha.tramitacaointeligente.com.br/clientes/${input.tramitacaoCustomerId}`
    : undefined;

  return [
    "### DADOS DA TRIAGEM",
    `- **Nome:** ${input.name}`,
    `- **WhatsApp:** ${input.contactNumber}`,
    `- **CPF:** ${input.cpf ?? "Não informado"}`,
    `- **E-mail:** ${input.email ?? "Não informado"}`,
    `- **Área Jurídica:** ${input.legalArea ?? "Não definida"}`,
    tiLink ? `- **Link TI:** ${tiLink}` : "",
    "",
    "### RESUMO DO CASO",
    input.notes ?? "Nenhuma nota disponível.",
    "",
    "---",
    "*Sincronizado automaticamente pelo AdvZap*",
  ].filter(l => l !== undefined).join("\n");
}

export async function trelloAddMovementComment(
  organizationId: string,
  cardId: string,
  movement: { tipo: string; resumo: string; processo: string; data: string }
): Promise<void> {
  const { key, token } = await getCreds(organizationId);
  const text = `📋 *Nova movimentação — ${movement.data}*\n\n**Tipo:** ${movement.tipo}\n**Processo:** ${movement.processo}\n\n${movement.resumo}\n\n---\n_Detectado automaticamente pelo AdvZap via DJEN_`;
  await fetch(
    `${BASE}/cards/${cardId}/actions/comments?key=${key}&token=${token}&text=${encodeURIComponent(text)}`,
    { method: "POST" }
  );
}

export async function trelloAppendPlainComment(organizationId: string, cardId: string, text: string) {
  const { key, token } = await getCreds(organizationId);
  const res = await fetch(
    `${BASE}/cards/${cardId}/actions/comments?key=${key}&token=${token}&text=${encodeURIComponent(text)}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Trello comentário falhou (${res.status})`);
}

export async function trelloSyncClientCard(
  organizationId: string,
  input: TrelloClientCardInput
): Promise<{ id: string; shortUrl: string }> {
  const { key, token, boardId, listId } = await getCreds(organizationId);
  if (!listId) throw new Error("TRELLO_LIST_ID não configurado.");

  const labels = await getBoardLabels(boardId, key, token);
  const matchLabel = labels.find(l =>
    l.name.toLowerCase().includes((input.legalArea ?? "").toLowerCase())
  );

  const title = `${input.name.toUpperCase()} - ${input.contactNumber}`;
  const desc = buildDesc(input);

  const existing = await findCardByPhone(input.contactNumber, boardId, key, token);

  if (existing) {
    const params = new URLSearchParams({ key, token, name: title, desc });
    if (matchLabel) params.set("idLabels", matchLabel.id);
    await fetch(`${BASE}/cards/${existing.id}?${params}`, { method: "PUT" });
    return existing;
  }

  const params = new URLSearchParams({ key, token, idList: listId, name: title, desc, pos: "top" });
  if (matchLabel) params.set("idLabels", matchLabel.id);
  const res = await fetch(`${BASE}/cards?${params}`, { method: "POST" });
  if (!res.ok) throw new Error(`Trello card creation failed (${res.status})`);
  return res.json();
}
