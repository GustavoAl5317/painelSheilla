import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateLeadSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().nullable(),
  legalArea: z.string().optional(),
  caseSummary: z.string().optional(),
  stageId: z.string().optional(),
  assignedToId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "CONVERTED", "LOST", "ARCHIVED"]).optional(),
  aiScore: z.number().min(0).max(100).optional(),
  aiSummary: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId },
    include: {
      stage: true,
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      conversations: {
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { lastMessageAt: "desc" },
      },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      notifications: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!lead) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  return NextResponse.json({ data: lead });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { id } = await params;
  const body = await req.json();
  const parsed = updateLeadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  if (parsed.data.stageId) {
    const stage = await prisma.kanbanStage.findFirst({
      where: { id: parsed.data.stageId, organizationId: orgId },
    });
    if (!stage) {
      return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    }
  }

  const lead = await prisma.lead.updateMany({
    where: { id, organizationId: orgId },
    data: parsed.data,
  });

  if (lead.count === 0) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  const updated = await prisma.lead.findUnique({
    where: { id },
    include: { stage: true, assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { id } = await params;

  const deleted = await prisma.lead.deleteMany({ where: { id, organizationId: orgId } });
  if (deleted.count === 0) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  return NextResponse.json({ message: "Lead removido com sucesso" });
}
