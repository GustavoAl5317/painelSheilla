import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const { enabled } = body ?? {};
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Campo 'enabled' (boolean) é obrigatório" }, { status: 400 });
  }

  const existing = await prisma.conversation.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { aiEnabled: enabled },
    select: { id: true, aiEnabled: true },
  });

  return NextResponse.json({ ok: true, aiEnabled: conversation.aiEnabled });
}
