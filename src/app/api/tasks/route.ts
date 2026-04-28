import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().optional(),
  assignedToId: z.string().optional(),
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  processId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine");
  const status = searchParams.get("status");

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      ...(mine === "true" && { assignedToId: userId }),
      ...(status && { status: status as any }),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      process: { select: { id: true, number: true, title: true } },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });

  return NextResponse.json({ data: tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  let orgId = body.organizationId as string | undefined;
  let userId = body.createdById as string | undefined;
  if (!orgId) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    orgId = (session.user as any).organizationId;
    userId = (session.user as any).id;
  }

  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      createdById: (userId ?? orgId)!,
      organizationId: orgId!,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
