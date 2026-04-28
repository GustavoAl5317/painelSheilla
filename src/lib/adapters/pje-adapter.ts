import "server-only";

const COMUNICA_API_URL = "https://comunicaapi.pje.jus.br/api/v1";

export interface PJeCommunication {
  id: string;
  numeroProcesso: string;
  tipoComunicacao: "INTIMACAO" | "CITACAO" | string;
  dataDisponibilizacao: string;
  prazo: number | null;
  unidadePrazo: "DIAS_UTEIS" | "DIAS_CORRIDOS" | null;
  orgaoJulgador: { codigo: string; nome: string } | null;
  texto: string | null;
  destinatario: { nome: string; documento: string } | null;
}

export interface PJeAuthResponse {
  access_token: string;
  user: {
    id: number;
    nome: string;
    email: string;
    cpf: string;
  };
}

export async function pjeAuthenticate(
  login: string,
  senha: string
): Promise<PJeAuthResponse> {
  const res = await fetch(`${COMUNICA_API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, senha }),
  });

  if (res.status === 403) throw new Error("Credenciais inválidas.");
  if (res.status === 404) throw new Error("Usuário não encontrado.");
  if (!res.ok) throw new Error(`Falha na autenticação PJe (${res.status}).`);

  return res.json();
}

export async function pjeFetchCommunications(
  accessToken: string,
  onlyUnread = true,
  page = 0,
  size = 50
): Promise<{ content: PJeCommunication[]; totalElements: number; last: boolean }> {
  const params = new URLSearchParams({
    size: String(size),
    page: String(page),
  });
  if (onlyUnread) params.set("filter", "lido==false");

  const res = await fetch(`${COMUNICA_API_URL}/comunicacao?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Erro ao buscar comunicações PJe (${res.status}).`);

  return res.json();
}

export async function pjeMarkAsRead(accessToken: string, communicationId: string): Promise<void> {
  await fetch(`${COMUNICA_API_URL}/comunicacao/${communicationId}/lida`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function pjeCalculateDueDate(
  dataDisponibilizacao: string,
  prazo: number | null,
  unidadePrazo: "DIAS_UTEIS" | "DIAS_CORRIDOS" | null
): Date {
  const base = new Date(dataDisponibilizacao);
  if (!prazo || !unidadePrazo) return base;

  if (unidadePrazo === "DIAS_CORRIDOS") {
    base.setDate(base.getDate() + prazo);
    return base;
  }

  // DIAS_UTEIS: pula sábados e domingos (feriados não contemplados)
  let added = 0;
  const cursor = new Date(base);
  while (added < prazo) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return cursor;
}
