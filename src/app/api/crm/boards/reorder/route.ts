import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const organizationId = (session.user as { organizationId: string }).organizationId;

  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "orderedIds deve ser um array" }, { status: 400 });
  }

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.crmBoard.updateMany({
        where: { id, organizationId },
        data: { order: index + 1 },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
