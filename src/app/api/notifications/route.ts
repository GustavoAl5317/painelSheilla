import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const notifications = await prisma.notification.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ data: notifications });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const organizationId = (session.user as { organizationId: string }).organizationId;
  const { id, all } = await req.json();

  if (all) {
    await prisma.notification.updateMany({
      where: { organizationId },
      data: { read: true },
    });
  } else if (id) {
    await prisma.notification.updateMany({
      where: { id, organizationId },
      data: { read: true },
    });
  }
  return NextResponse.json({ ok: true });
}
