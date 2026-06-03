import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;

  const result = await prisma.conversation.updateMany({
    where: {
      organizationId: orgId,
      isBlocked: false,
    },
    data: { aiEnabled: true },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
