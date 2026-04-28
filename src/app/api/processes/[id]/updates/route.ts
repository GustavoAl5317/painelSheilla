import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendCaseCardEntry } from "@/lib/case-card";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: processId } = await params;

  const proc = await prisma.process.findFirst({
    where: { id: processId, organizationId: orgId },
    select: { id: true, clientId: true },
  });
  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });

  const card = proc.clientId
    ? await prisma.clientCaseCard.findUnique({
        where: { clientId: proc.clientId },
        include: { entries: { orderBy: { createdAt: "desc" } } },
      })
    : null;

  return NextResponse.json({ entries: card?.entries ?? [], sendUpdates: card?.sendUpdates ?? true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: processId } = await params;
  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const shareWithClient = Boolean(body.shareWithClient);

  if (!content) return NextResponse.json({ error: "content é obrigatório" }, { status: 400 });

  const proc = await prisma.process.findFirst({
    where: { id: processId, organizationId: orgId },
    select: { id: true, clientId: true },
  });
  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });

  if (!proc.clientId) return NextResponse.json({ error: "Processo sem cliente vinculado" }, { status: 400 });

  const result = await appendCaseCardEntry(orgId, proc.clientId, {
    source: "COMMENT",
    content,
    shareWithClient,
    processId,
  });

  return NextResponse.json({ ok: true, entryId: result.entryId, notified: result.notified });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: processId } = await params;
  const body = await req.json();

  if (typeof body.sendUpdates !== "boolean") {
    return NextResponse.json({ error: "sendUpdates (boolean) é obrigatório" }, { status: 400 });
  }

  const proc = await prisma.process.findFirst({
    where: { id: processId, organizationId: orgId },
    select: { clientId: true },
  });
  if (!proc) return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });

  if (!proc.clientId) return NextResponse.json({ error: "Processo sem cliente vinculado" }, { status: 400 });
  const card = await prisma.clientCaseCard.findUnique({ where: { clientId: proc.clientId } });
  if (!card) return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });

  await prisma.clientCaseCard.update({
    where: { id: card.id },
    data: { sendUpdates: body.sendUpdates },
  });

  return NextResponse.json({ ok: true, sendUpdates: body.sendUpdates });
}
