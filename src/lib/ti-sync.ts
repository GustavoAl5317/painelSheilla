import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCredential } from "@/lib/credentials";
import { importProcessesFromTramitacaoForPainelClient } from "@/lib/ti-client-process-import";
import { ensureClientCaseCard } from "@/lib/case-card";

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
  /** Itens extras mesclados a partir de `included` na listagem JSON:API */
  processos?: unknown[];
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

/** Anexa às linhas de cliente os recursos `included` da mesma página (processos por customer_id). */
function mergeIncludedProcessesFromListRoot(
  root: Record<string, unknown>,
  customers: TICustomerRaw[]
): TICustomerRaw[] {
  const inc = root.included;
  const includedList = Array.isArray(inc) ? inc : [];

  return customers.map(c => {
    const extras: unknown[] = [];
    const seen = new Set<string>();

    const pushExtra = (row: Record<string, unknown>) => {
      const n =
        (typeof row.numero_processo === "string" && row.numero_processo) ||
        (typeof row.numeroProcesso === "string" && row.numeroProcesso) ||
        (typeof row.cnj === "string" && row.cnj) ||
        "";
      const key = n.replace(/\D/g, "") || JSON.stringify(row).slice(0, 80);
      if (seen.has(key)) return;
      seen.add(key);
      extras.push(row);
    };

    for (const item of includedList) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const attrs = (o.attributes as Record<string, unknown>) ?? {};
      const custId = attrs.customer_id ?? attrs.customerId ?? attrs.cliente_id ?? o.customer_id;
      if (custId !== undefined && custId !== null) {
        if (Number(custId) !== c.id && String(custId) !== String(c.id)) continue;
      } else {
        continue;
      }

      const typeStr = typeof o.type === "string" ? o.type.toLowerCase() : "";
      const looksProcess =
        typeStr.includes("process") ||
        typeStr.includes("lawsuit") ||
        typeStr.includes("proced") ||
        typeStr.includes("legal");
      const hasNum =
        typeof attrs.numero_processo === "string" ||
        typeof attrs.numeroProcesso === "string" ||
        typeof attrs.numero_cnj === "string" ||
        typeof attrs.cnj === "string" ||
        typeof attrs.numero === "string" ||
        typeof o.numero_processo === "string";

      if (!looksProcess && !hasNum) continue;
      pushExtra({ ...attrs, ...o });
    }

    const anyC = c as unknown as Record<string, unknown>;
    const rels = anyC.relationships as Record<string, unknown> | undefined;
    if (rels && includedList.length > 0) {
      const procRel =
        (rels.processos as Record<string, unknown> | undefined) ??
        (rels.processes as Record<string, unknown> | undefined) ??
        (rels.lawsuits as Record<string, unknown> | undefined);
      const dataBlock = procRel?.data;
      const refs: Array<{ type?: string; id?: string | number }> = Array.isArray(dataBlock)
        ? (dataBlock as Array<{ type?: string; id?: string | number }>)
        : dataBlock && typeof dataBlock === "object"
          ? [dataBlock as { type?: string; id?: string | number }]
          : [];

      for (const ref of refs) {
        if (ref.id == null) continue;
        for (const item of includedList) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          if (String(o.id) !== String(ref.id)) continue;
          if (ref.type && typeof o.type === "string" && o.type !== ref.type) continue;
          const attrs = (o.attributes as Record<string, unknown>) ?? {};
          pushExtra({ ...attrs, ...o });
          break;
        }
      }
    }

    if (extras.length === 0) return c;
    const prev = Array.isArray(c.processos) ? c.processos : [];
    return { ...c, processos: [...prev, ...extras] };
  });
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
  const data = (await res.json()) as Record<string, unknown>;
  const customers = (data.customers ?? []) as TICustomerRaw[];
  return {
    customers: mergeIncludedProcessesFromListRoot(data, customers),
    totalPages: (data.pagination as { pages?: number } | undefined)?.pages ?? 1,
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

          // Busca todos os processos deste cliente para criar/vincular cards
          const clientProcesses = await prisma.process.findMany({
            where: { organizationId, clientId },
            orderBy: { createdAt: "asc" },
          });

          // Garante que existe um ClientCaseCard e vincula ao primeiro processo
          const caseCard = await ensureClientCaseCard(organizationId, clientId);
          if (!caseCard.processId && clientProcesses.length > 0) {
            await prisma.clientCaseCard.update({
              where: { id: caseCard.id },
              data: { processId: clientProcesses[0]!.id },
            });
          }

          // Para cada processo, cria um CrmCard vinculado ao processo (se ainda não existir)
          if (clientProcesses.length > 0) {
            const firstBoard = await prisma.crmBoard.findFirst({
              where: { organizationId },
              orderBy: { order: "asc" },
            });

            if (firstBoard) {
              for (const proc of clientProcesses) {
                const exists = await prisma.crmCard.findFirst({
                  where: { organizationId, processId: proc.id },
                });
                if (exists) continue;

                const title = [
                  ti.name.trim().toUpperCase(),
                  proc.number && proc.number !== "(a definir)" ? proc.number : null,
                ].filter(Boolean).join(" — ");

                await prisma.crmCard.create({
                  data: {
                    organizationId,
                    boardId: firstBoard.id,
                    clientId,
                    processId: proc.id,
                    title,
                    description: [
                      proc.legalArea ? `**Área:** ${proc.legalArea}` : null,
                      proc.court ? `**Tribunal:** ${proc.court}` : null,
                      `**Telefone:** ${rowSnapshot.phone ?? "N/A"}`,
                      `**CPF:** ${rowSnapshot.cpf ?? "N/A"}`,
                    ].filter(Boolean).join("\n"),
                  },
                });
              }
            }
          }
        } catch (err) {
          result.errors.push(`[${ti.name}] ${(err as Error).message}`);
        }
      })
    );
  }

  return result;
}
