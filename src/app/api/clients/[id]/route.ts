import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendCaseCardEntry } from "@/lib/case-card";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const client = await prisma.client.findFirst({ where: { id, organizationId } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.processNumber === "string") data.processNumber = body.processNumber.trim();
  if (typeof body.notes === "string") data.notes = body.notes;

  const updated = await prisma.client.update({ where: { id }, data });

  // Se o processNumber foi atualizado, tenta sincronizar com o card de Processo vinculado
  if (data.processNumber) {
    const firstProcess = await prisma.process.findFirst({
      where: { clientId: id, number: "(a definir)" },
      orderBy: { createdAt: "asc" }
    });
    if (firstProcess) {
      await prisma.process.update({
        where: { id: firstProcess.id },
        data: { number: data.processNumber as string }
      });
    }
  }

  // Se o advogado adicionou uma nota marcada para enviar ao cliente, registra no card
  if (typeof body.notes === "string" && body.shareWithClient === true) {
    await appendCaseCardEntry(organizationId, id, {
      source: "COMMENT",
      content: body.notes,
      shareWithClient: true,
    });
  }

  return NextResponse.json({ ok: true, client: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  const client = await prisma.client.findFirst({ where: { id, organizationId } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  await prisma.client.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
