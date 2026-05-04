import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const { boardId, title, description, processId, clientId, dueDate, priority, tags } = await req.json();
  if (!boardId || !title) {
    return NextResponse.json({ error: "boardId e title são obrigatórios" }, { status: 400 });
  }

  const board = await prisma.crmBoard.findFirst({ where: { id: boardId, organizationId } });
  if (!board) return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });

  const last = await prisma.crmCard.findFirst({
    where: { boardId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const card = await prisma.crmCard.create({
    data: {
      title,
      description: description ?? null,
      boardId,
      organizationId,
      processId: processId ?? null,
      clientId: clientId ?? null,
      order: (last?.order ?? 0) + 1,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority ?? "NONE",
      tags: tags ?? [],
    },
    include: {
      process: { select: { id: true, number: true, title: true } },
      client: { select: { id: true, name: true } },
      _count: { select: { activities: true } },
    },
  });

  return NextResponse.json(card, { status: 201 });
}
