import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDJEN } from "@/lib/djen-sync";

// Chamado pelo Vercel Cron Jobs (GET) — configurado em vercel.json
// Horários: 08h, 14h e 20h de segunda a sábado (horário UTC)
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Busca todos os orgs que têm DJEN_OAB configurado
  const rows = await prisma.orgCredential.findMany({
    where: { key: "DJEN_OAB" },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, message: "Nenhuma organização com DJEN configurado." });
  }

  const results: { organizationId: string; synced: number; errors: string[] }[] = [];

  for (const { organizationId } of rows) {
    try {
      const result = await syncDJEN(organizationId);
      results.push({ organizationId, ...result });
    } catch (err) {
      results.push({ organizationId, synced: 0, errors: [(err as Error).message] });
    }
  }

  const totalSynced = results.reduce((acc, r) => acc + r.synced, 0);
  console.log(`[DJEN Cron] ${totalSynced} publicações sincronizadas em ${rows.length} org(s).`);

  return NextResponse.json({ ok: true, totalSynced, results });
}
