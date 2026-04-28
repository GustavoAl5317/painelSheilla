import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { fetchComunicacoesOAB, mapItemToPub } from "@/lib/djen-sync";

const DEFAULT_BASE_URL = "https://planilha.tramitacaointeligente.com.br/api/v1";

interface TICustomerRaw {
  id: number;
  uuid: string;
  name: string;
  cpf_cnpj: string;
  email?: string | null;
  phone_mobile?: string | null;
  state?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  zipcode?: string | null;
  street?: string | null;
  street_number?: string | null;
  rg_numero?: string | null;
  sexo?: string | null;
  birthdate?: string | null;
  marital_status?: string | null;
  profession?: string | null;
  tags?: { name: string; color: string; id: number }[];
}

export interface TISyncResult {
  created: number;
  updated: number;
  skipped: number;
  processesLinked: number;
  errors: string[];
}

function buildAddress(ti: TICustomerRaw): string | undefined {
  const parts = [
    ti.street && ti.street_number ? `${ti.street}, ${ti.street_number}` : ti.street,
    ti.neighborhood,
    ti.city,
    ti.state,
    ti.zipcode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : undefined;
}

function buildNotes(ti: TICustomerRaw): string | undefined {
  const parts = [
    ti.profession ? `Profissão: ${ti.profession}` : null,
    ti.marital_status ? `Estado civil: ${ti.marital_status}` : null,
    ti.birthdate ? `Nascimento: ${ti.birthdate}` : null,
    ti.sexo ? `Sexo: ${ti.sexo}` : null,
    ti.tags && ti.tags.length > 0 ? `Tags TI: ${ti.tags.map(t => t.name).join(", ")}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchPage(
  baseUrl: string,
  headers: Record<string, string>,
  page: number
): Promise<{ customers: TICustomerRaw[]; totalPages: number }> {
  const res = await fetch(`${baseUrl}/clientes?page=${page}&per_page=100`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} na página ${page}`);
  const data = await res.json();
  return {
    customers: data.customers ?? [],
    totalPages: data.pagination?.pages ?? 1,
  };
}

export async function syncTIClients(organizationId: string): Promise<TISyncResult> {
  const result: TISyncResult = { created: 0, updated: 0, skipped: 0, processesLinked: 0, errors: [] };

  const apiKey = await resolveCredential(organizationId, "TRAMITACAO_API_KEY");
  if (!apiKey) {
    result.errors.push("TRAMITACAO_API_KEY não configurada.");
    return result;
  }

  const baseUrlCred = await resolveCredential(organizationId, "TRAMITACAO_API_URL");
  const baseUrl = (baseUrlCred ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // ── Busca primeira página para descobrir total ───────────────────────────────
  let firstPage: { customers: TICustomerRaw[]; totalPages: number };
  try {
    firstPage = await fetchPage(baseUrl, headers, 1);
  } catch (err) {
    result.errors.push(`Erro ao buscar página 1: ${(err as Error).message}`);
    return result;
  }

  const allCustomers: TICustomerRaw[] = [...firstPage.customers];
  const totalPages = firstPage.totalPages;

  // ── Busca páginas restantes em paralelo (lotes de 10) ───────────────────────
  const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const CONCURRENCY = 10;

  for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
    const batch = remainingPages.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(p => fetchPage(baseUrl, headers, p))
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        allCustomers.push(...r.value.customers);
      } else {
        result.errors.push(`Erro em lote de páginas: ${r.reason?.message ?? r.reason}`);
      }
    }
  }

  if (allCustomers.length === 0) {
    result.errors.push("Nenhum cliente retornado pela API da TI.");
    return result;
  }

  // ── Filtra apenas clientes com CPF válido ───────────────────────────────────
  const validCustomers: Array<{ ti: TICustomerRaw; cpf: string }> = [];
  for (const ti of allCustomers) {
    const cpf = ti.cpf_cnpj?.replace(/\D/g, "") ?? "";
    if (!cpf || cpf.length < 11) { result.skipped++; continue; }
    validCustomers.push({ ti, cpf });
  }

  // ── Carrega todos os clientes existentes de uma vez ─────────────────────────
  const cpfList = validCustomers.map(v => v.cpf);
  const tiIdList = validCustomers.map(v => v.ti.id);

  const existingClients = await prisma.client.findMany({
    where: {
      organizationId,
      OR: [
        { cpf: { in: cpfList } },
        { tramitacaoCustomerId: { in: tiIdList } },
      ],
    },
    select: { id: true, cpf: true, tramitacaoCustomerId: true, phone: true, email: true, address: true, rg: true, notes: true },
  });

  const byCpf = new Map(existingClients.map(c => [c.cpf, c]));
  const byTiId = new Map(existingClients.map(c => [c.tramitacaoCustomerId, c]));

  // ── Busca publicações do DJEN para cruzar com CPFs novos ────────────────────
  const oabRaw = await resolveCredential(organizationId, "DJEN_OAB");
  let djenPubs: ReturnType<typeof mapItemToPub>[] = [];

  if (oabRaw) {
    const oabs = oabRaw.split(",").map(s => s.trim()).filter(Boolean);
    const d0 = new Date();
    d0.setDate(d0.getDate() - 90); // últimos 90 dias para cobrir histórico no primeiro sync
    const dataInicio = toISODateLocal(d0);
    const dataFim = toISODateLocal(new Date());

    for (const oab of oabs) {
      const numero = oab.replace(/[^0-9]/g, "");
      const uf = oab.replace(/[^a-zA-Z]/g, "").toUpperCase();
      try {
        const items = await fetchComunicacoesOAB(numero, uf, dataInicio, dataFim);
        djenPubs.push(...items.map(mapItemToPub));
      } catch (err) {
        result.errors.push(`DJEN OAB ${numero}/${uf}: ${(err as Error).message}`);
      }
    }
  }

  // Índice: CPF (só dígitos) → lista de publicações que o mencionam
  const pubsByCpf = new Map<string, typeof djenPubs>();
  for (const pub of djenPubs) {
    for (const cpf of pub.cpfs) {
      if (!pubsByCpf.has(cpf)) pubsByCpf.set(cpf, []);
      pubsByCpf.get(cpf)!.push(pub);
    }
  }

  // ── Processa em lotes de 50 (upserts paralelos) ──────────────────────────────
  const BATCH_SIZE = 50;
  const now = new Date();

  for (let i = 0; i < validCustomers.length; i += BATCH_SIZE) {
    const batch = validCustomers.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async ({ ti, cpf }) => {
        try {
          const address = buildAddress(ti);
          const tiNotes = buildNotes(ti);
          const existing = byCpf.get(cpf) ?? byTiId.get(ti.id) ?? null;

          let clientId: string;

          if (existing) {
            await prisma.client.update({
              where: { id: existing.id },
              data: {
                tramitacaoCustomerId:   ti.id,
                tramitacaoCustomerUuid: ti.uuid,
                tramitacaoSyncStatus:   "Sincronizado",
                tramitacaoSyncedAt:     now,
                phone:   existing.phone   || ti.phone_mobile?.replace(/\D/g, "") || undefined,
                email:   existing.email   || ti.email || undefined,
                address: existing.address || address || undefined,
                rg:      existing.rg      || ti.rg_numero?.trim() || undefined,
                notes:   existing.notes   || tiNotes || undefined,
              },
            });
            clientId = existing.id;
            result.updated++;
          } else {
            const created = await prisma.client.create({
              data: {
                organizationId,
                name:  ti.name,
                cpf,
                phone: ti.phone_mobile?.replace(/\D/g, "") || undefined,
                email: ti.email || undefined,
                rg:    ti.rg_numero?.trim() || undefined,
                address: address || undefined,
                notes: tiNotes || undefined,
                tramitacaoCustomerId:   ti.id,
                tramitacaoCustomerUuid: ti.uuid,
                tramitacaoSyncStatus:   "Sincronizado",
                tramitacaoSyncedAt:     now,
              },
            });
            clientId = created.id;
            result.created++;
          }

          // ── Vincula processos encontrados no DJEN pelo CPF ─────────────────
          const pubs = pubsByCpf.get(cpf) ?? [];
          for (const pub of pubs) {
            const processNumberSlice = pub.processo.replace(/[^\d]/g, "").slice(0, 20);
            if (processNumberSlice.length < 10) continue;

            const alreadyExists = await prisma.process.findFirst({
              where: { organizationId, number: { contains: processNumberSlice } },
            });
            if (alreadyExists) continue;

            await prisma.process.create({
              data: {
                organizationId,
                clientId,
                number: pub.processo.trim(),
                title: pub.nomeClasse || pub.tipoComunicacao || `Acompanhamento — ${pub.processo}`,
                court: pub.siglaTribunal ?? pub.nomeOrgao ?? undefined,
                observations: "Processo vinculado automaticamente via DJEN no sync da Tramitação Inteligente.",
                lastMovement: pub.rawText.slice(0, 500),
                lastMovementAt: now,
              },
            });
            result.processesLinked++;
          }
        } catch (err) {
          result.errors.push(`[${ti.name}] ${(err as Error).message}`);
        }
      })
    );
  }

  return result;
}
