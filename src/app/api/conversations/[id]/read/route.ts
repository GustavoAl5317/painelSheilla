import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id: conversationId } = await params;

  await prisma.conversation.updateMany({
    where: { id: conversationId, organizationId: orgId },
    data: { unreadCount: 0 },
  });

  return NextResponse.json({ ok: true });
}
