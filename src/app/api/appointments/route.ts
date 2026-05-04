// Trigger HMR
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  clientId: z.string().optional(),
  processId: z.string().optional(),
  notifyClient: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const clientId = searchParams.get("clientId");

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: orgId,
      ...(from && { date: { gte: new Date(from) } }),
      ...(to && { date: { lte: new Date(to) } }),
      ...(clientId && { clientId }),
    },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      process: { select: { id: true, number: true, title: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ data: appointments });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const userId = (session.user as any).id;
  const body = await req.json();

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const appointment = await prisma.appointment.create({
    data: {
      ...parsed.data,
      date: new Date(parsed.data.date),
      organizationId: orgId,
      createdById: userId,
    },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      process: { select: { id: true, number: true, title: true } },
    },
  });

  return NextResponse.json({ data: appointment }, { status: 201 });
}
