import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const template = await prisma.promptTemplate.findFirst({ where: { id, organizationId } });
  if (!template) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const { name, description, content, isDefault } = await req.json();

  // Se está marcando como padrão, remove o padrão anterior
  if (isDefault && !template.isDefault) {
    await prisma.promptTemplate.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.promptTemplate.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() ?? null }),
      ...(content !== undefined && { content: content.trim() }),
      ...(isDefault !== undefined && { isDefault }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const template = await prisma.promptTemplate.findFirst({ where: { id, organizationId } });
  if (!template) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (template.isSystem) return NextResponse.json({ error: "Modelos do sistema não podem ser excluídos" }, { status: 403 });

  await prisma.promptTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
