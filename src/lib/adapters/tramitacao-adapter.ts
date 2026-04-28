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
