import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ clients: [], processes: [], leads: [] });
  }

  const [clients, processes, leads] = await Promise.all([
    prisma.client.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { cpf: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      take: 8,
      select: { id: true, name: true, phone: true, cpf: true },
    }),
    prisma.process.findMany({
      where: {
        organizationId,
        OR: [
          { number: { contains: q } },
          { title: { contains: q, mode: "insensitive" } },
          { client: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: 8,
      select: {
        id: true,
        number: true,
        title: true,
        client: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        organizationId,
        NOT: [
          { phone: { contains: "@g.us" } },
          { phone: { contains: "-group" } },
          { phone: { contains: "group" } },
          { phone: { contains: "@broadcast" } },
        ],
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      take: 8,
      select: { id: true, name: true, phone: true, legalArea: true },
    }),
  ]);

  return NextResponse.json({ clients, processes, leads });
}
