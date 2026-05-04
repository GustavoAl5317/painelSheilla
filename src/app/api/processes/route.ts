import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createProcessSchema = z.object({
  number: z.string().optional().nullable(),
  title: z.string().optional(),
  court: z.string().optional(),
  legalArea: z.string().optional(),
  clientId: z.string(),
  assignedToId: z.string().optional(),
  observations: z.string().optional(),
  nextHearing: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const processes = await prisma.process.findMany({
    where: {
      organizationId: orgId,
      ...(status && { status: status as any }),
    },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
      deadlines: { where: { status: { in: ["PENDING", "OVERDUE"] } }, orderBy: { dueDate: "asc" } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: processes });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Aceita organizationId do body (demo/API externa) ou da sessão autenticada
  let orgId = body.organizationId as string | undefined;
  if (!orgId) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    orgId = (session.user as any).organizationId;
  }

  const parsed = createProcessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const process = await prisma.process.create({
    data: {
      ...parsed.data,
      nextHearing: parsed.data.nextHearing ? new Date(parsed.data.nextHearing) : undefined,
      organizationId: orgId!,
    },
    include: {
      client: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // Vincula automaticamente o ClientCaseCard ao processo recém-criado
  if (parsed.data.clientId) {
    await prisma.clientCaseCard.upsert({
      where: { clientId: parsed.data.clientId },
      create: { organizationId: orgId!, clientId: parsed.data.clientId, processId: process.id },
      update: { processId: process.id },
    });
  }

  return NextResponse.json({ data: process }, { status: 201 });
}
