import "server-only";
import { prisma } from "@/lib/prisma";
import {
  collectProcessesFromTICustomer,
  tiFetchCustomerPayloadForProcesses,
  type TIProcess,
} from "@/lib/adapters/tramitacao-adapter";

const OBS_MAX_LEN = 95_000;

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function titleFromTiSnapshot(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = pickString(raw, [
    "classe",
    "nomeClasse",
    "nome_classe",
    "assunto",
    "tipo_acao",
    "tipoAcao",
    "descricao",
    "titulo",
  ]);
  if (!t) return undefined;
  return t.length > 480 ? `${t.slice(0, 477)}...` : t;
}

function legalAreaFromTiSnapshot(raw: Record<string, unknown> | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = pickString(raw, ["area_juridica", "areaJuridica", "legal_area", "ramo", "segmento"]);
  if (!t) return undefined;
  return t.length > 120 ? `${t.slice(0, 117)}...` : t;
}

function buildTiObservations(tiProc: TIProcess): string {
  const base: Record<string, unknown> = {
    fonte: "tramitacao_inteligente",
    importadoEm: new Date().toISOString(),
    tiProcessoId: tiProc.id,
    snapshot: tiProc.tiSourceRaw ?? null,
  };
  let s = JSON.stringify(base);
  if (s.length <= OBS_MAX_LEN) return s;

  const snap = tiProc.tiSourceRaw;
  const snapStr = snap ? JSON.stringify(snap) : "";
  const head = snapStr.slice(0, Math.max(0, OBS_MAX_LEN - 12_000));
  return JSON.stringify({
    fonte: base.fonte,
    importadoEm: base.importadoEm,
    tiProcessoId: base.tiProcessoId,
    snapshotTruncado: true,
    snapshotInicio: head,
    snapshotTamanho: snapStr.length,
  });
}

/**
 * Tenta extrair processos do objeto do cliente TI (GET /clientes/{id}).
 * NOTA: A API da TI não possui endpoint dedicado de processos — processos chegam
 * via webhook publications.created. Esta função apenas extrai dados que a TI
 * eventualmente embute no objeto do cliente.
 */
export async function importProcessesFromTramitacaoForPainelClient(
  organizationId: string,
  painelClientId: string,
  tiCustomer: unknown
): Promise<{ imported: number; updated: number; totalFromTi: number }> {
  const base = tiCustomer as { id?: number };
  if (typeof base.id !== "number") {
    return { imported: 0, updated: 0, totalFromTi: 0 };
  }

  // Coleta processos embutidos no objeto do cliente (lista ou GET /clientes/{id})
  const fromObj = collectProcessesFromTICustomer(
    typeof tiCustomer === "object" && tiCustomer !== null
      ? (tiCustomer as Record<string, unknown>)
      : {}
  );

  // Tenta GET /clientes/{id} (único endpoint válido da TI para clientes)
  let fromDossier: TIProcess[] = [];
  try {
    const fat = await tiFetchCustomerPayloadForProcesses(organizationId, base.id);
    fromDossier = collectProcessesFromTICustomer(fat);
  } catch {
    // endpoint indisponível
  }

  // Deduplica por número de processo
  const seen = new Set<string>();
  const list: TIProcess[] = [];
  for (const p of [...fromObj, ...fromDossier]) {
    const key = (p.numero_processo_com_mascara ?? p.numero_processo ?? "")
      .replace(/\D/g, "")
      .slice(0, 20);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(p);
  }

  if (list.length === 0) return { imported: 0, updated: 0, totalFromTi: 0 };

  let imported = 0;
  let updated = 0;
  for (const tiProc of list) {
    const rawNumber = tiProc.numero_processo_com_mascara ?? tiProc.numero_processo;
    const cleanNumber = rawNumber.replace(/\s/g, "");
    if (!cleanNumber) continue;

    const digits = cleanNumber.replace(/\D/g, "");
    const existing = await prisma.process.findFirst({
      where: {
        organizationId,
        clientId: painelClientId,
        OR: [{ number: cleanNumber }, ...(digits.length >= 15 ? [{ number: { contains: digits.slice(0, 20) } }] : [])],
      },
    });

    let lastMovementAt: Date | undefined;
    if (tiProc.ultima_movimentacao) {
      const d = new Date(tiProc.ultima_movimentacao);
      if (!Number.isNaN(d.getTime())) lastMovementAt = d;
    }

    const observations = buildTiObservations(tiProc);
    const snap = tiProc.tiSourceRaw ?? null;
    const titleGuess = titleFromTiSnapshot(snap);
    const legalAreaGuess = legalAreaFromTiSnapshot(snap);

    if (!existing) {
      await prisma.process.create({
        data: {
          organizationId,
          clientId: painelClientId,
          number: cleanNumber,
          title: titleGuess,
          court: tiProc.tribunal ?? undefined,
          legalArea: legalAreaGuess,
          lastMovement: tiProc.ultima_movimentacao ?? undefined,
          lastMovementAt,
          status: "ACTIVE",
          observations,
        },
      });
      imported++;
    } else {
      await prisma.process.update({
        where: { id: existing.id },
        data: {
          number: cleanNumber,
          court: tiProc.tribunal ?? existing.court ?? undefined,
          lastMovement: tiProc.ultima_movimentacao ?? existing.lastMovement ?? undefined,
          lastMovementAt: lastMovementAt ?? existing.lastMovementAt ?? undefined,
          observations,
          title: titleGuess ?? existing.title ?? undefined,
          legalArea: legalAreaGuess ?? existing.legalArea ?? undefined,
        },
      });
      updated++;
    }
  }

  return { imported, updated, totalFromTi: list.length };
}
