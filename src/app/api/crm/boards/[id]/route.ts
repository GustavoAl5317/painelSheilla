import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const board = await prisma.crmBoard.findFirst({ where: { id, organizationId } });
  if (!board) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const data = await req.json();
  const updated = await prisma.crmBoard.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const board = await prisma.crmBoard.findFirst({ where: { id, organizationId } });
  if (!board) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.crmBoard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
