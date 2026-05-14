import "server-only";
import { resolveCredential } from "@/lib/credentials";

const DEFAULT_BASE_URL = "https://planilha.tramitacaointeligente.com.br/api/v1";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TICustomerInput {
  name: string;
  phone_mobile?: string;
  cpf_cnpj: string;
  email?: string;
  sexo?: string;
  birthdate?: string | null;
  mother_name?: string;
  father_name?: string;
  profession?: string;
  marital_status?: string;
  rg_numero?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  zipcode?: string;
  street?: string;
  street_number?: string;
}

export interface TICustomer {
  id: number;
  uuid: string;
  name: string;
  cpf_cnpj: string;
  email?: string;
  phone_mobile?: string;
  processes?: TIProcess[];
  last_movements?: TIMovement[];
}

export interface TIProcess {
  id: number;
  numero_processo: string;
  numero_processo_com_mascara?: string;
  tribunal?: string;
  status?: string;
  ultima_movimentacao?: string;
}

export interface TIMovement {
  id: number;
  processo: string;
  texto: string;
  data: string;
}

export interface TIPublication {
  id: string | number;
  texto: string;
  numero_processo: string;
  numero_processo_com_mascara?: string;
  link_tramitacao?: string;
  link?: string;
  destinatarios?: { nome: string }[];
  disponibilizacao_date?: string;
  inicio_do_prazo_date?: string;
  siglaTribunal?: string;
  nomeOrgao?: string;
  nomeClasse?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getHeaders(organizationId: string) {
  const apiKey = await resolveCredential(organizationId, "TRAMITACAO_API_KEY");
  if (!apiKey) throw new Error("Tramitação Inteligente API Key não configurada.");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function getBaseUrl(organizationId: string) {
  const url = await resolveCredential(organizationId, "TRAMITACAO_API_URL");
  return (url ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

const CNJ_MASKED_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function isPlausibleProcessNumber(s: string): boolean {
  const d = digitsOnly(s);
  return d.length === 20 || (d.length >= 15 && d.length <= 25);
}

function extractCnjFromText(text: string | undefined): string[] {
  if (!text) return [];
  const masked = text.match(CNJ_MASKED_RE) ?? [];
  const twenty = text.match(/\b\d{20}\b/g) ?? [];
  return [...masked, ...twenty];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function pickProcessMasked(o: Record<string, unknown>): string | undefined {
  if (typeof o.numero_processo_com_mascara === "string") return o.numero_processo_com_mascara;
  if (typeof o.numeroProcessoComMascara === "string") return o.numeroProcessoComMascara;
  return undefined;
}

function pickProcessNumber(o: Record<string, unknown>): string | undefined {
  if (typeof o.numero_processo === "string") return o.numero_processo;
  if (typeof o.numeroProcesso === "string") return o.numeroProcesso;
  if (typeof o.cnj === "string") return o.cnj;
  if (typeof o.process_number === "string") return o.process_number;
  if (typeof o.numeroCnj === "string") return o.numeroCnj;
  return pickProcessMasked(o);
}

function pickMovementDate(mv: Record<string, unknown>): string | undefined {
  if (typeof mv.data === "string") return mv.data;
  if (typeof mv.data_movimentacao === "string") return mv.data_movimentacao;
  if (typeof mv.dataMovimentacao === "string") return mv.dataMovimentacao;
  if (typeof mv.created_at === "string") return mv.created_at;
  if (typeof mv.createdAt === "string") return mv.createdAt;
  return undefined;
}

/**
 * A documentação OpenAPI da TI não inclui `processes` em Customer, mas o JSON
 * real pode trazer `processes`, `processos`, ou números só em `last_movements`.
 * Unifica tudo em uma lista para gravar em `Process`.
 */
export function collectProcessesFromTICustomer(raw: unknown): TIProcess[] {
  const top = asRecord(raw);
  if (!top) return [];

  const dossier = asRecord(top.dossier);
  const r: Record<string, unknown> = dossier ? { ...dossier, ...top } : top;

  const seen = new Set<string>();
  const out: TIProcess[] = [];

  const push = (row: {
    id?: number;
    numero_processo?: string;
    numero_processo_com_mascara?: string;
    tribunal?: string;
    status?: string;
    ultima_movimentacao?: string;
  }) => {
    const rawNum = row.numero_processo_com_mascara ?? row.numero_processo ?? "";
    const trimmed = rawNum.replace(/\s/g, "").trim();
    if (!trimmed || !isPlausibleProcessNumber(trimmed)) return;
    const key = digitsOnly(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: row.id ?? 0,
      numero_processo: row.numero_processo_com_mascara ?? row.numero_processo ?? trimmed,
      numero_processo_com_mascara: row.numero_processo_com_mascara,
      tribunal: row.tribunal,
      status: row.status,
      ultima_movimentacao: row.ultima_movimentacao,
    });
  };

  const arraysToScan: unknown[] = [
    r.processes,
    r.processos,
    r.procedimentos,
    r.proceedings,
    r.customer_processes,
    asRecord(r.customer)?.processes,
    asRecord(r.customer)?.processos,
    asRecord(r.customer)?.procedimentos,
  ].filter(Boolean);

  for (const list of arraysToScan) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") {
        push({ numero_processo: item });
      } else {
        const o = asRecord(item);
        if (!o) continue;
        push({
          id: typeof o.id === "number" ? o.id : Number(o.id) || 0,
          numero_processo: pickProcessNumber(o),
          numero_processo_com_mascara: pickProcessMasked(o),
          tribunal:
            typeof o.tribunal === "string"
              ? o.tribunal
              : typeof o.siglaTribunal === "string"
                ? o.siglaTribunal
                : typeof o.sigla_tribunal === "string"
                  ? o.sigla_tribunal
                  : undefined,
          status: typeof o.status === "string" ? o.status : undefined,
          ultima_movimentacao:
            typeof o.ultima_movimentacao === "string"
              ? o.ultima_movimentacao
              : typeof o.updated_at === "string"
                ? o.updated_at
                : typeof o.updatedAt === "string"
                  ? o.updatedAt
                  : undefined,
        });
      }
    }
  }

  const movementKeys = [
    "last_movements",
    "ultimas_movimentacoes",
    "lastMovements",
    "movimentacoes",
    "movimentos",
  ] as const;
  for (const key of movementKeys) {
    const movements = r[key];
    if (!Array.isArray(movements)) continue;
    for (const m of movements) {
      const mv = asRecord(m);
      if (!mv) continue;
      const proc =
        typeof mv.processo === "string"
          ? mv.processo
          : typeof mv.numero_processo === "string"
            ? mv.numero_processo
            : typeof mv.process_number === "string"
              ? mv.process_number
              : undefined;
      if (proc) {
        push({
          id: typeof mv.id === "number" ? mv.id : Number(mv.id) || 0,
          numero_processo: proc,
          ultima_movimentacao: pickMovementDate(mv),
        });
      }
      const texto = typeof mv.texto === "string" ? mv.texto : "";
      for (const found of extractCnjFromText(texto)) {
        push({
          id: typeof mv.id === "number" ? mv.id : 0,
          numero_processo: found,
          ultima_movimentacao: pickMovementDate(mv),
        });
      }
    }
  }

  return out;
}

/** Tentativas best-effort a caminhos não documentados (404 = ignora). */
export async function tiFetchProcessesForCustomer(
  organizationId: string,
  tiCustomerId: number
): Promise<TIProcess[]> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  const paths = [
    `/clientes/${tiCustomerId}/processos`,
    `/clientes/${tiCustomerId}/processos?page=1&per_page=100`,
    `/processos?customer_id=${tiCustomerId}`,
    `/processos?customer_id=${tiCustomerId}&per_page=100`,
    `/processos?cliente_id=${tiCustomerId}`,
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { headers });
      if (!res.ok) continue;
      const json: unknown = await res.json().catch(() => null);
      const rec = asRecord(json);
      if (!rec) continue;
      const arr =
        rec.processes ??
        rec.processos ??
        (Array.isArray(rec.data) ? rec.data : null) ??
        (Array.isArray(json) ? json : null);
      if (Array.isArray(arr) && arr.length > 0) {
        const merged = collectProcessesFromTICustomer({ processes: arr });
        if (merged.length > 0) return merged;
      }
    } catch {
      /* próximo path */
    }
  }

  return [];
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

export async function tiCreateCustomer(
  organizationId: string,
  data: TICustomerInput
): Promise<TICustomer> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  const clean = (v?: string) => v?.replace(/\D/g, "") ?? "";

  const payload = {
    customer: {
      ...data,
      cpf_cnpj: clean(data.cpf_cnpj),
      phone_mobile: clean(data.phone_mobile),
    },
  };

  const res = await fetch(`${baseUrl}/clientes`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 422) {
    // CPF já cadastrado — busca e vincula
    const existing = await tiSearchByCPF(organizationId, data.cpf_cnpj);
    if (existing) {
      await tiUpdateCustomer(organizationId, existing.id, { phone_mobile: clean(data.phone_mobile) });
      return existing;
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.errors?.join(", ") ?? `TI createCustomer failed (${res.status})`);
  }

  const json = await res.json();
  return json.customer ?? json;
}

export async function tiUpdateCustomer(
  organizationId: string,
  tiId: number,
  data: Partial<TICustomerInput>
): Promise<void> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  await fetch(`${baseUrl}/clientes/${tiId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ customer: data }),
  });
}

export async function tiGetDossier(
  organizationId: string,
  tiId: number
): Promise<TICustomer> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  const res = await fetch(`${baseUrl}/clientes/${tiId}`, { headers });
  if (!res.ok) throw new Error(`TI getDossier failed (${res.status})`);
  const json = await res.json();
  return json.customer ?? json;
}

export async function tiSearchByCPF(
  organizationId: string,
  cpf: string
): Promise<TICustomer | null> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);
  const cleanCpf = cpf.replace(/\D/g, "");

  const res = await fetch(`${baseUrl}/clientes?cpf_cnpj=${cleanCpf}`, { headers });
  if (!res.ok) return null;
  const json = await res.json();
  const customers: TICustomer[] = json.customers ?? [];
  return customers.find(c => c.cpf_cnpj?.replace(/\D/g, "") === cleanCpf) ?? null;
}

export async function tiSearchByPhone(
  organizationId: string,
  phone: string
): Promise<TICustomer | null> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone) return null;

  const res = await fetch(`${baseUrl}/clientes?q=${cleanPhone}`, { headers });
  if (!res.ok) return null;
  const json = await res.json();
  const customers: TICustomer[] = json.customers ?? [];
  return customers.find(c => c.phone_mobile?.replace(/\D/g, "").includes(cleanPhone)) ?? null;
}

export async function tiCreateNote(
  organizationId: string,
  tiCustomerId: number,
  content: string
): Promise<void> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  // Busca primeiro usuário da org para atribuir a nota
  let userId: number | undefined;
  try {
    const usersRes = await fetch(`${baseUrl}/usuarios`, { headers });
    if (usersRes.ok) {
      const data = await usersRes.json();
      userId = data.users?.[0]?.id;
    }
  } catch { /* ignora */ }

  await fetch(`${baseUrl}/notas`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      note: { customer_id: tiCustomerId, content, user_id: userId },
    }),
  });
}

export async function tiUpsertNote(
  organizationId: string,
  tiCustomerId: number,
  content: string
): Promise<void> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  // Busca notas existentes para atualizar se já existe uma de triagem
  const notesRes = await fetch(`${baseUrl}/notas?customer_id=${tiCustomerId}`, { headers });
  if (notesRes.ok) {
    const data = await notesRes.json();
    const triageNote = (data.notes ?? []).find((n: any) =>
      n.content?.includes("Nome:") || n.content?.includes("Área:")
    );
    if (triageNote) {
      await fetch(`${baseUrl}/notas/${triageNote.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ note: { content } }),
      });
      return;
    }
  }

  await tiCreateNote(organizationId, tiCustomerId, content);
}

export async function tiSyncAllCustomers(organizationId: string): Promise<{ count: number }> {
  const headers = await getHeaders(organizationId);
  const baseUrl = await getBaseUrl(organizationId);

  let page = 1;
  let totalPages = 1;
  const customers: TICustomer[] = [];

  do {
    const res = await fetch(`${baseUrl}/clientes?page=${page}&per_page=100`, { headers });
    if (!res.ok) break;
    const data = await res.json();
    customers.push(...(data.customers ?? []));
    totalPages = data.pagination?.pages ?? 1;
    page++;
    await new Promise(r => setTimeout(r, 500));
  } while (page <= totalPages);

  return { count: customers.length };
}
