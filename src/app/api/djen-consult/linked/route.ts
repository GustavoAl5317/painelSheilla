import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/djen-consult/linked?comunicaIds=1,2,3
// Retorna quais comunicaIds já foram vinculados e a quais clientes/processos
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const raw = req.nextUrl.searchParams.get("comunicaIds") ?? "";
  const ids = raw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

  if (ids.length === 0) return NextResponse.json({ linked: {} });

  // Deadlines com padrão "DJEN — {processo} [ref. {comunicaId}]"
  // Filtra pelos IDs solicitados via LIKE para evitar full scan em orgs com muitos deadlines
  const deadlines = await prisma.deadline.findMany({
    where: {
      organizationId: orgId,
      title: { contains: "[ref." },
      processId: { not: null },
    },
    select: { title: true, processId: true },
    take: 2000,
    orderBy: { createdAt: "desc" },
  });

  // Monta mapa comunicaId → processId
  const comunicaToProcess: Record<number, string> = {};
  for (const d of deadlines) {
    const match = d.title.match(/\[ref\.\s*(\d+)\]/);
    if (match) {
      const cid = parseInt(match[1], 10);
      if (ids.includes(cid) && d.processId) {
        comunicaToProcess[cid] = d.processId;
      }
    }
  }

  if (Object.keys(comunicaToProcess).length === 0) return NextResponse.json({ linked: {} });

  // Para cada processo vinculado, busca clientes
  const processIds = [...new Set(Object.values(comunicaToProcess))];
  const processes = await prisma.process.findMany({
    where: { id: { in: processIds }, organizationId: orgId },
    select: { id: true, number: true, title: true, clientId: true, client: { select: { id: true, name: true, cpf: true } } },
  });

  const procMap = Object.fromEntries(processes.map(p => [p.id, p]));

  const linked: Record<number, { processId: string; processNumber: string | null; processTitle: string | null; client: { id: string; name: string; cpf: string | null } | null }> = {};
  for (const [cidStr, processId] of Object.entries(comunicaToProcess)) {
    const proc = procMap[processId];
    if (proc) {
      linked[Number(cidStr)] = {
        processId: proc.id,
        processNumber: proc.number,
        processTitle: proc.title,
        client: proc.client ?? null,
      };
    }
  }

  return NextResponse.json({ linked });
}
