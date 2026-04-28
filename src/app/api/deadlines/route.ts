import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createDeadlineSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string(),
  processId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const upcoming = searchParams.get("upcoming");

  const now = new Date();

  const deadlines = await prisma.deadline.findMany({
    where: {
      organizationId: orgId,
      ...(status && { status: status as any }),
      ...(upcoming === "true" && {
        dueDate: { gte: now },
        status: "PENDING",
      }),
    },
    include: {
      process: { select: { id: true, number: true, title: true, client: { select: { name: true } } } },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({ data: deadlines });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const body = await req.json();
  const parsed = createDeadlineSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const deadline = await prisma.deadline.create({
    data: {
      ...parsed.data,
      dueDate: new Date(parsed.data.dueDate),
      organizationId: orgId,
    },
    include: { process: { select: { id: true, number: true, title: true } } },
  });

  return NextResponse.json({ data: deadline }, { status: 201 });
}
