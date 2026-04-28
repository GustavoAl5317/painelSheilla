import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, color, order } = await req.json();
  const stage = await prisma.kanbanStage.update({
    where: { id },
    data: { ...(name && { name }), ...(color && { color }), ...(order !== undefined && { order }) },
  });
  return NextResponse.json(stage);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const count = await prisma.lead.count({ where: { stageId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: "Não é possível excluir uma etapa que possui leads." },
      { status: 409 }
    );
  }
  await prisma.kanbanStage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
