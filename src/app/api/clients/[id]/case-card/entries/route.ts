import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendCaseCardEntry } from "@/lib/case-card";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id: clientId } = await params;
  const body = await req.json();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const shareWithClient = Boolean(body.shareWithClient);

  if (!content) {
    return NextResponse.json({ error: "content é obrigatório" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const result = await appendCaseCardEntry(organizationId, clientId, {
    source: "COMMENT",
    content,
    shareWithClient,
  });

  return NextResponse.json({ ok: true, entryId: result.entryId, notified: result.notified });
}
