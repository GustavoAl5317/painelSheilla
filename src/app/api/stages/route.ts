import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const stages = await prisma.kanbanStage.findMany({
    where: { organizationId },
    orderBy: { order: "asc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json(stages);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const orgFromSession = (session.user as { organizationId: string }).organizationId;

  const { organizationId, name, color } = await req.json();
  const orgId = organizationId ?? orgFromSession;
  if (orgId !== orgFromSession) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  if (!name) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }

  const last = await prisma.kanbanStage.findFirst({
    where: { organizationId: orgId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .concat(`_${Date.now()}`);

  const stage = await prisma.kanbanStage.create({
    data: {
      name,
      slug,
      color: color ?? "#6b7280",
      order: (last?.order ?? 0) + 1,
      organizationId: orgId,
    },
  });

  return NextResponse.json(stage, { status: 201 });
}
