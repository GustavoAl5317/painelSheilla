/// <reference types="next" />
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tiUpsertNote } from "@/lib/adapters/tramitacao-adapter";
import { syncTIClients, type TISyncResult } from "@/lib/ti-sync";
import { buildTramitacaoTriageNoteContent } from "@/lib/tramitacao-client-note";

/** Sincronização pesada (TI + muitas notas); alinhar com o plano Vercel. */
export const maxDuration = 300;

// GET — Vercel Cron (vercel.json). Atualiza clientes a partir da TI e reenvia a nota com resumo/conversa do painel.

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.orgCredential.findMany({
    where: { key: "TRAMITACAO_API_KEY" },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, message: "Nenhuma organização com Tramitação Inteligente configurada." });
  }

  const maxPerOrg = Math.max(0, parseInt(process.env.TRAMITACAO_CRON_MAX_CLIENTS_PER_ORG ?? "0", 10) || 0);
  const concurrency = Math.min(8, Math.max(1, parseInt(process.env.TRAMITACAO_CRON_NOTE_CONCURRENCY ?? "4", 10) || 4));

  type OrgResult = {
    organizationId: string;
    tiSync: TISyncResult;
    clientsWithTi: number;
    notesRefreshed: number;
    noteErrors: string[];
  };

  const perOrg: OrgResult[] = [];

  for (const { organizationId } of rows) {
    let tiSync: TISyncResult;
    try {
      tiSync = await syncTIClients(organizationId);
    } catch (e) {
      tiSync = {
        created: 0,
        updated: 0,
        skipped: 0,
        processesLinked: 0,
        tramitacaoProcessesImported: 0,
        errors: [(e as Error).message],
      };
    }

    const clients = await prisma.client.findMany({
      where: { organizationId, tramitacaoCustomerId: { not: null } },
      select: {
        id: true,
        name: true,
        cpf: true,
        phone: true,
        email: true,
        notes: true,
        tramitacaoCustomerId: true,
      },
      orderBy: { tramitacaoSyncedAt: "asc" },
      ...(maxPerOrg > 0 ? { take: maxPerOrg } : {}),
    });

    const noteErrors: string[] = [];
    let notesRefreshed = 0;

    for (let i = 0; i < clients.length; i += concurrency) {
      const chunk = clients.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        chunk.map(async c => {
          const content = await buildTramitacaoTriageNoteContent(
            {
              id: c.id,
              name: c.name,
              cpf: c.cpf,
              phone: c.phone,
              email: c.email,
              notes: c.notes,
            },
            organizationId
          );
          await tiUpsertNote(organizationId, c.tramitacaoCustomerId!, content);
        })
      );

      settled.forEach((s, idx) => {
        if (s.status === "fulfilled") notesRefreshed++;
        else noteErrors.push(`${chunk[idx]!.id}: ${(s.reason as Error)?.message ?? s.reason}`);
      });
    }

    perOrg.push({
      organizationId,
      tiSync,
      clientsWithTi: clients.length,
      notesRefreshed,
      noteErrors,
    });
  }

  return NextResponse.json({
    ok: true,
    organizations: rows.length,
    perOrg,
  });
}
