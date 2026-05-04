import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const cards = await prisma.crmCard.findMany({
    where: {
      organizationId,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
    include: {
      board: { select: { id: true, name: true, color: true } },
      process: { select: { id: true, number: true, title: true } },
      client: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(cards);
}
