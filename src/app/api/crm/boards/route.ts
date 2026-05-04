import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .concat(`_${Date.now()}`);
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const boards = await prisma.crmBoard.findMany({
    where: { organizationId },
    orderBy: { order: "asc" },
    include: {
      cards: {
        orderBy: { order: "asc" },
        include: {
          process: { select: { id: true, number: true, title: true } },
          client: { select: { id: true, name: true } },
          _count: { select: { activities: true } },
        },
      },
    },
  });

  return NextResponse.json(boards);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const { name, color } = await req.json();
  if (!name) return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });

  const last = await prisma.crmBoard.findFirst({
    where: { organizationId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const board = await prisma.crmBoard.create({
    data: {
      name,
      slug: toSlug(name),
      color: color ?? "#6b7280",
      order: (last?.order ?? 0) + 1,
      organizationId,
    },
    include: { cards: true },
  });

  return NextResponse.json(board, { status: 201 });
}
