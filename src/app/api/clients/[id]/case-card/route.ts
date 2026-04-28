import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureClientCaseCard, notifyClientCaseCardIfReady } from "@/lib/case-card";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id: clientId } = await params;

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    include: {
      processes: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true } },
    },
  });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const card = await ensureClientCaseCard(organizationId, clientId);
  const full = await prisma.clientCaseCard.findFirst({
    where: { id: card.id },
    include: {
      entries: { orderBy: { createdAt: "desc" } },
      process: { select: { id: true, number: true, title: true } },
    },
  });

  return NextResponse.json({
    card: full,
    processes: client.processes,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id: clientId } = await params;
  const body = await req.json();
  const processId = typeof body.processId === "string" ? body.processId : null;

  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  if (!processId || !processId.trim()) {
    return NextResponse.json({ error: "processId é obrigatório para vincular" }, { status: 400 });
  }

  const proc = await prisma.process.findFirst({
    where: { id: processId, organizationId, clientId },
  });
  if (!proc) {
    return NextResponse.json(
      { error: "Processo não encontrado ou não pertence a este cliente." },
      { status: 400 }
    );
  }

  const card = await ensureClientCaseCard(organizationId, clientId);
  await prisma.clientCaseCard.update({
    where: { id: card.id },
    data: { processId: proc.id },
  });

  await prisma.caseCardEntry.create({
    data: {
      cardId: card.id,
      source: "SYSTEM",
      content: `Processo vinculado ao cartão: ${proc.number}${proc.title ? ` — ${proc.title}` : ""}`,
      shareWithClient: false,
    },
  });

  await notifyClientCaseCardIfReady(organizationId, clientId);

  return NextResponse.json({ ok: true, processId: proc.id });
}
