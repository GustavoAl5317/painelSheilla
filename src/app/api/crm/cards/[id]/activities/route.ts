import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const card = await prisma.crmCard.findFirst({ where: { id, organizationId } });
  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const activities = await prisma.crmCardActivity.findMany({
    where: { cardId: id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true } } },
  });

  return NextResponse.json(activities);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const userId = (session.user as { id: string }).id;
  const { id } = await params;

  const card = await prisma.crmCard.findFirst({ where: { id, organizationId } });
  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const { content } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: "content é obrigatório" }, { status: 400 });
  }

  const activity = await prisma.crmCardActivity.create({
    data: { cardId: id, content: content.trim(), userId },
    include: { user: { select: { id: true, name: true } } },
  });

  await pusherServer.trigger(`org-${organizationId}`, "crm:activity-added", {
    cardId: id,
    cardTitle: card.title,
    activityId: activity.id,
    userName: (session.user as { name?: string }).name ?? "Alguém",
  });

  return NextResponse.json(activity, { status: 201 });
}
