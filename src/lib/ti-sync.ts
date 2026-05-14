import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { importProcessesFromTramitacaoForPainelClient } from "@/lib/ti-client-process-import";

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
  /** Processos importados do dossiê/API da Tramitação por cliente */
  tramitacaoProcessesImported: number;
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
  const result: TISyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    processesLinked: 0,
    tramitacaoProcessesImported: 0,
    errors: [],
  };

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

  const byTiFromApi = new Map<number, TICustomerRaw>();
  for (const ti of allCustomers) {
    byTiFromApi.set(ti.id, ti);
  }
  const uniqueCustomers = [...byTiFromApi.values()];

  const tiIds = [...byTiFromApi.keys()];
  const cpfsForQuery = [
    ...new Set(
      uniqueCustomers
        .map(c => c.cpf_cnpj?.replace(/\D/g, "") ?? "")
        .filter(c => c.length >= 11)
    ),
  ];

  type ClientRow = {
    id: string;
    cpf: string | null;
    tramitacaoCustomerId: number | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    rg: string | null;
    notes: string | null;
  };

  const existingClients = await prisma.client.findMany({
    where: {
      organizationId,
      OR: [
        { tramitacaoCustomerId: { in: tiIds } },
        ...(cpfsForQuery.length > 0 ? [{ cpf: { in: cpfsForQuery } }] : []),
      ],
    },
    select: {
      id: true,
      cpf: true,
      tramitacaoCustomerId: true,
      phone: true,
      email: true,
      address: true,
      rg: true,
      notes: true,
    },
  });

  const byCpf = new Map<string, ClientRow>();
  for (const c of existingClients) {
    if (c.cpf) byCpf.set(c.cpf, c);
  }
  const byTiId = new Map<number, ClientRow>();
  for (const c of existingClients) {
    if (c.tramitacaoCustomerId != null) byTiId.set(c.tramitacaoCustomerId, c);
  }

  // ── Processa em lotes de 50 (upserts paralelos) ──────────────────────────────
  const BATCH_SIZE = 50;
  const now = new Date();

  for (let i = 0; i < uniqueCustomers.length; i += BATCH_SIZE) {
    const batch = uniqueCustomers.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async ti => {
        try {
          if (!ti.name?.trim()) {
            result.skipped++;
            return;
          }

          const cpfDigits = ti.cpf_cnpj?.replace(/\D/g, "") ?? "";
          const cpfOk = cpfDigits.length >= 11;
          const cpfForDb = cpfOk ? cpfDigits : null;

          const address = buildAddress(ti);
          const tiNotes = buildNotes(ti);
          const existing = byTiId.get(ti.id) ?? (cpfOk ? byCpf.get(cpfDigits) : undefined) ?? null;

          let clientId: string;
          let rowSnapshot: ClientRow;

          if (existing) {
            const mergedCpf = existing.cpf ?? cpfForDb ?? undefined;
            await prisma.client.update({
              where: { id: existing.id },
              data: {
                tramitacaoCustomerId: ti.id,
                tramitacaoCustomerUuid: ti.uuid,
                tramitacaoSyncStatus: "Sincronizado",
                tramitacaoSyncedAt: now,
                name: ti.name.trim(),
                cpf: mergedCpf ?? undefined,
                phone: existing.phone || ti.phone_mobile?.replace(/\D/g, "") || undefined,
                email: existing.email || ti.email || undefined,
                address: existing.address || address || undefined,
                rg: existing.rg || ti.rg_numero?.trim() || undefined,
                notes: existing.notes || tiNotes || undefined,
              },
            });
            clientId = existing.id;
            result.updated++;
            rowSnapshot = {
              id: clientId,
              cpf: mergedCpf ?? null,
              tramitacaoCustomerId: ti.id,
              phone: existing.phone || ti.phone_mobile?.replace(/\D/g, "") || null,
              email: existing.email || ti.email || null,
              address: existing.address || address || null,
              rg: existing.rg || ti.rg_numero?.trim() || null,
              notes: existing.notes || tiNotes || null,
            };
          } else {
            const created = await prisma.client.create({
              data: {
                organizationId,
                name: ti.name.trim(),
                cpf: cpfForDb ?? undefined,
                phone: ti.phone_mobile?.replace(/\D/g, "") || undefined,
                email: ti.email || undefined,
                rg: ti.rg_numero?.trim() || undefined,
                address: address || undefined,
                notes: tiNotes || undefined,
                tramitacaoCustomerId: ti.id,
                tramitacaoCustomerUuid: ti.uuid,
                tramitacaoSyncStatus: "Sincronizado",
                tramitacaoSyncedAt: now,
              },
            });
            clientId = created.id;
            result.created++;
            rowSnapshot = {
              id: clientId,
              cpf: cpfForDb,
              tramitacaoCustomerId: ti.id,
              phone: ti.phone_mobile?.replace(/\D/g, "") || null,
              email: ti.email || null,
              address: address || null,
              rg: ti.rg_numero?.trim() || null,
              notes: tiNotes || null,
            };
          }

          if (existing?.cpf && cpfOk && existing.cpf !== cpfDigits) {
            byCpf.delete(existing.cpf);
          }
          byTiId.set(ti.id, rowSnapshot);
          if (cpfOk) byCpf.set(cpfDigits, rowSnapshot);

          await new Promise(r => setTimeout(r, 60));
          const tiProcRes = await importProcessesFromTramitacaoForPainelClient(organizationId, clientId, ti);
          result.tramitacaoProcessesImported += tiProcRes.imported + tiProcRes.updated;
        } catch (err) {
          result.errors.push(`[${ti.name}] ${(err as Error).message}`);
        }
      })
    );
  }

  return result;
}
