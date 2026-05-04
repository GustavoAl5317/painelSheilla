import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id, activityId } = await params;

  const card = await prisma.crmCard.findFirst({ where: { id, organizationId } });
  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const activity = await prisma.crmCardActivity.findFirst({ where: { id: activityId, cardId: id } });
  if (!activity) return NextResponse.json({ error: "Atividade não encontrada" }, { status: 404 });
  if (activity.userId !== userId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content é obrigatório" }, { status: 400 });

  const updated = await prisma.crmCardActivity.update({
    where: { id: activityId },
    data: { content: content.trim() },
    include: { user: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id, activityId } = await params;

  const card = await prisma.crmCard.findFirst({ where: { id, organizationId } });
  if (!card) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const activity = await prisma.crmCardActivity.findFirst({ where: { id: activityId, cardId: id } });
  if (!activity) return NextResponse.json({ error: "Atividade não encontrada" }, { status: 404 });
  if (activity.userId !== userId) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.crmCardActivity.delete({ where: { id: activityId } });
  return NextResponse.json({ ok: true });
}
