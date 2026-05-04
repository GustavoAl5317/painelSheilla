import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  date: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
  clientId: z.string().optional().nullable(),
  processId: z.string().optional().nullable(),
  notifyClient: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const orgId = (session.user as any).organizationId;
  const body = await req.json();

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const appointment = await prisma.appointment.update({
      where: { id, organizationId: orgId },
      data: {
        ...parsed.data,
        date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        process: { select: { id: true, number: true, title: true } },
      },
    });
    return NextResponse.json({ data: appointment });
  } catch {
    return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const orgId = (session.user as any).organizationId;

  try {
    await prisma.appointment.delete({ where: { id, organizationId: orgId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  }
}
