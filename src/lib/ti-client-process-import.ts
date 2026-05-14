import "server-only";
import { prisma } from "@/lib/prisma";
import {
  collectProcessesFromTICustomer,
  tiFetchProcessesForCustomer,
  tiGetDossier,
} from "@/lib/adapters/tramitacao-adapter";

/**
 * Busca processos na TI (dossiê + endpoints auxiliares) e grava em Process vinculados ao cliente do painel.
 */
export async function importProcessesFromTramitacaoForPainelClient(
  organizationId: string,
  painelClientId: string,
  tiCustomer: unknown
): Promise<{ imported: number; totalFromTi: number }> {
  const base = tiCustomer as { id?: number };
  if (typeof base.id !== "number") {
    return { imported: 0, totalFromTi: 0 };
  }

  let merged: Record<string, unknown> = {
    ...(typeof tiCustomer === "object" && tiCustomer !== null ? (tiCustomer as object) : {}),
  };
  let list = collectProcessesFromTICustomer(merged);

  if (list.length === 0) {
    try {
      const dossier = await tiGetDossier(organizationId, base.id);
      merged = { ...merged, ...(dossier as object) };
      list = collectProcessesFromTICustomer(merged);
    } catch {
      /* dossier indisponível */
    }
  }

  if (list.length === 0) {
    try {
      const extra = await tiFetchProcessesForCustomer(organizationId, base.id);
      if (extra.length > 0) list = extra;
    } catch {
      /* endpoints opcionais */
    }
  }

  let imported = 0;
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

    if (!existing) {
      let lastMovementAt: Date | undefined;
      if (tiProc.ultima_movimentacao) {
        const d = new Date(tiProc.ultima_movimentacao);
        if (!Number.isNaN(d.getTime())) lastMovementAt = d;
      }
      await prisma.process.create({
        data: {
          organizationId,
          clientId: painelClientId,
          number: cleanNumber,
          court: tiProc.tribunal ?? undefined,
          lastMovement: tiProc.ultima_movimentacao ?? undefined,
          lastMovementAt,
          status: "ACTIVE",
        },
      });
      imported++;
    }
  }

  return { imported, totalFromTi: list.length };
}
