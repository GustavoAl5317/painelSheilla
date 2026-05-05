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
  const { blocked } = body ?? {};
  
  if (typeof blocked !== "boolean") {
    return NextResponse.json({ error: "Campo 'blocked' (boolean) é obrigatório" }, { status: 400 });
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
    data: {
      isBlocked: blocked,
      aiEnabled: blocked ? false : true,
    },
    select: { id: true, isBlocked: true, aiEnabled: true },
  });

  return NextResponse.json({ 
    ok: true, 
    isBlocked: conversation.isBlocked,
    aiEnabled: conversation.aiEnabled 
  });
}
