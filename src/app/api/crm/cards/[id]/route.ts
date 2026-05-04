import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const card = await prisma.crmCard.findFirst({
    where: { id, organizationId },
    include: {
      process: { select: { id: true, number: true, title: true } },
      client: { select: { id: true, name: true, phone: true } },
      activities: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(card);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const card = await prisma.crmCard.findFirst({ where: { id, organizationId } });
  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const { title, description, boardId, processId, clientId, order, dueDate, priority, tags } = await req.json();
  const boardChanged = boardId !== undefined && boardId !== card.boardId;

  const updated = await prisma.crmCard.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(boardId !== undefined && { boardId }),
      ...(processId !== undefined && { processId: processId || null }),
      ...(clientId !== undefined && { clientId: clientId || null }),
      ...(order !== undefined && { order }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(priority !== undefined && { priority }),
      ...(tags !== undefined && { tags }),
    },
    include: {
      process: { select: { id: true, number: true, title: true } },
      client: { select: { id: true, name: true, phone: true } },
      _count: { select: { activities: true } },
    },
  });

  if (boardChanged) {
    await pusherServer.trigger(`org-${organizationId}`, "crm:card-moved", {
      cardId: id,
      fromBoardId: card.boardId,
      toBoardId: boardId,
      cardTitle: updated.title,
      movedBy: (session.user as { name?: string }).name ?? "Alguém",
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const card = await prisma.crmCard.findFirst({ where: { id, organizationId } });
  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.crmCard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
