import "server-only";
import { buildAuthHeaders, type TIAuthResult } from "@/lib/ti-web-auth";

const BASE_API = "https://planilha.tramitacaointeligente.com.br/api/v1";
const DELAY_MS = 400; // pausa entre requests para não sobrecarregar a TI

export interface TIScrapedProcess {
  id: number;
  numero: string;
  numeroMascara?: string;
  tribunal?: string;
  status?: string;
  ultimaMovimentacao?: string;
  classe?: string;
  assunto?: string;
  partes?: string;
  raw: Record<string, unknown>;
}

export interface TIScrapedNote {
  id: number;
  content: string;
  createdAt?: string;
  updatedAt?: string;
  userName?: string;
}

export interface TIScrapedClient {
  id: number;
  uuid?: string;
  name: string;
  cpf?: string;
  email?: string;
  phone?: string;
  slug?: string;
  processes: TIScrapedProcess[];
  notes: TIScrapedNote[];
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function tiGet(auth: TIAuthResult, path: string): Promise<unknown> {
  const h = buildAuthHeaders(auth);
  const res = await fetch(`${BASE_API}${path}`, { headers: h });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(o: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function parseProcess(raw: unknown): TIScrapedProcess | null {
  const o = asRecord(raw);
  if (!o) return null;
  // Desestrutura atributos JSON:API se houver
  const attrs = asRecord(o.attributes) ?? o;

  const numero =
    str(attrs, "numero_processo_com_mascara", "numeroProcessoComMascara") ??
    str(attrs, "numero_processo", "numeroProcesso", "cnj", "numero_cnj", "numero");

  if (!numero) return null;
  const digits = numero.replace(/\D/g, "");
  if (digits.length < 15) return null;

  return {
    id: Number(o.id ?? attrs.id ?? 0),
    numero,
    numeroMascara: str(attrs, "numero_processo_com_mascara", "numeroProcessoComMascara"),
    tribunal: str(attrs, "tribunal", "siglaTribunal", "sigla_tribunal", "tribunal_nome"),
    status: str(attrs, "status", "situacao", "state"),
    ultimaMovimentacao: str(
      attrs,
      "ultima_movimentacao",
      "ultimaMovimentacao",
      "last_movement",
      "updated_at",
      "updatedAt"
    ),
    classe: str(attrs, "classe", "nomeClasse", "nome_classe", "tipo_acao", "assunto_principal"),
    assunto: str(attrs, "assunto", "subject", "descricao"),
    partes: formatPartes(attrs),
    raw: JSON.parse(JSON.stringify(attrs)) as Record<string, unknown>,
  };
}

function formatPartes(o: Record<string, unknown>): string | undefined {
  const partes = o.partes ?? o.parties ?? o.polo_ativo ?? null;
  if (!partes) return undefined;
  if (typeof partes === "string") return partes;
  if (Array.isArray(partes)) {
    return partes
      .map(p => {
        const pr = asRecord(p);
        if (!pr) return String(p);
        const nome = str(pr, "nome", "name", "razao_social");
        const polo = str(pr, "polo", "role", "tipo");
        return polo ? `${nome} (${polo})` : nome;
      })
      .filter(Boolean)
      .join(", ");
  }
  return undefined;
}

function parseNote(raw: unknown): TIScrapedNote | null {
  const o = asRecord(raw);
  if (!o) return null;
  const content = str(o, "content", "texto", "body", "descricao");
  if (!content) return null;
  return {
    id: Number(o.id ?? 0),
    content,
    createdAt: str(o, "created_at", "createdAt"),
    updatedAt: str(o, "updated_at", "updatedAt"),
    userName: str(o, "user_name", "userName", "autor"),
  };
}

/** Busca todos os clientes da TI com paginação. */
export async function tiScrapeAllClients(auth: TIAuthResult): Promise<TIScrapedClient[]> {
  const out: TIScrapedClient[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await tiGet(auth, `/clientes?page=${page}&per_page=100`);
    const rec = asRecord(data);
    if (!rec) break;

    const customers = Array.isArray(rec.customers)
      ? rec.customers
      : Array.isArray(rec.data)
        ? rec.data
        : [];

    for (const raw of customers) {
      const o = asRecord(raw);
      if (!o) continue;
      const attrs = asRecord(o.attributes) ?? o;
      out.push({
        id: Number(o.id ?? attrs.id ?? 0),
        uuid: str(attrs, "uuid"),
        name: str(attrs, "name", "nome") ?? "Sem nome",
        cpf: str(attrs, "cpf_cnpj", "cpf", "cnpj"),
        email: str(attrs, "email"),
        phone: str(attrs, "phone_mobile", "phone", "telefone"),
        slug: str(attrs, "slug"),
        processes: [],
        notes: [],
      });
    }

    const pagination = asRecord(rec.pagination) ?? asRecord(rec.meta);
    totalPages = Number(pagination?.pages ?? pagination?.total_pages ?? 1);
    page++;

    if (page <= totalPages) await delay(DELAY_MS);
  } while (page <= totalPages);

  return out;
}

/** Busca processos de um cliente específico na TI. */
export async function tiScrapeClientProcesses(
  auth: TIAuthResult,
  clientId: number
): Promise<TIScrapedProcess[]> {
  const seen = new Set<string>();
  const out: TIScrapedProcess[] = [];

  const push = (raw: unknown) => {
    const p = parseProcess(raw);
    if (!p) return;
    const key = p.numero.replace(/\D/g, "").slice(0, 20);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  const endpoints = [
    `/clientes/${clientId}/processos`,
    `/clientes/${clientId}/processos?page=1&per_page=200`,
    `/processos?customer_id=${clientId}&per_page=200`,
    `/processos?cliente_id=${clientId}&per_page=200`,
  ];

  for (const path of endpoints) {
    try {
      const data = await tiGet(auth, path);
      const rec = asRecord(data);
      if (!rec) continue;

      const items =
        (Array.isArray(rec.processes) ? rec.processes : null) ??
        (Array.isArray(rec.processos) ? rec.processos : null) ??
        (Array.isArray(rec.data) ? rec.data : null) ??
        (Array.isArray(data) ? data : null) ??
        [];

      for (const item of items) push(item);
      if (out.length > 0) break;
    } catch { /* tenta próximo endpoint */ }
    await delay(DELAY_MS);
  }

  // Tenta também o dossier do cliente (às vezes embute os processos)
  if (out.length === 0) {
    try {
      const dossier = await tiGet(auth, `/clientes/${clientId}`);
      const rec = asRecord(dossier);
      if (rec) {
        const customer = asRecord(rec.customer) ?? rec;
        const lists = [
          customer.processes,
          customer.processos,
          customer.lawsuits,
          customer.procedimentos,
        ].filter(Array.isArray);
        for (const list of lists) {
          for (const item of list as unknown[]) push(item);
        }
      }
    } catch { /* ignora */ }
  }

  return out;
}

/** Busca notas de um cliente específico na TI. */
export async function tiScrapeClientNotes(
  auth: TIAuthResult,
  clientId: number
): Promise<TIScrapedNote[]> {
  const out: TIScrapedNote[] = [];
  const seen = new Set<number>();

  const push = (raw: unknown) => {
    const n = parseNote(raw);
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
  };

  try {
    const data = await tiGet(auth, `/notas?customer_id=${clientId}`);
    const rec = asRecord(data);
    if (rec) {
      const items =
        (Array.isArray(rec.notes) ? rec.notes : null) ??
        (Array.isArray(rec.data) ? rec.data : null) ??
        [];
      for (const item of items) push(item);
    }
  } catch { /* ignora */ }

  // Fallback: tenta /annotations
  if (out.length === 0) {
    try {
      const data = await tiGet(auth, `/anotacoes?customer_id=${clientId}`);
      const rec = asRecord(data);
      if (rec) {
        const items =
          (Array.isArray(rec.anotacoes) ? rec.anotacoes : null) ??
          (Array.isArray(rec.data) ? rec.data : null) ??
          [];
        for (const item of items) push(item);
      }
    } catch { /* ignora */ }
  }

  return out;
}

/** Formata os dados de um processo em texto legível para o card. */
export function formatProcessForCard(p: TIScrapedProcess): string {
  const lines: string[] = [];
  lines.push(`📋 Número: ${p.numeroMascara ?? p.numero}`);
  if (p.tribunal) lines.push(`🏛️ Tribunal: ${p.tribunal}`);
  if (p.status) lines.push(`⚡ Status: ${p.status}`);
  if (p.classe) lines.push(`📂 Classe: ${p.classe}`);
  if (p.assunto) lines.push(`📌 Assunto: ${p.assunto}`);
  if (p.partes) lines.push(`👥 Partes: ${p.partes}`);
  if (p.ultimaMovimentacao) lines.push(`📅 Última movimentação: ${formatDateBR(p.ultimaMovimentacao)}`);
  return lines.join("\n");
}

/** Formata as notas de um cliente em texto para o card. */
export function formatNotesForCard(notes: TIScrapedNote[]): string {
  if (notes.length === 0) return "";
  return notes
    .map((n, i) => {
      const header =
        notes.length > 1
          ? `── Nota ${i + 1}${n.createdAt ? ` · ${formatDateBR(n.createdAt)}` : ""}${n.userName ? ` · ${n.userName}` : ""} ──`
          : `── Nota${n.createdAt ? ` · ${formatDateBR(n.createdAt)}` : ""}${n.userName ? ` · ${n.userName}` : ""} ──`;
      return `${header}\n${n.content.trim()}`;
    })
    .join("\n\n");
}

function formatDateBR(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
