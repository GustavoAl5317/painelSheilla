import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createLeadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  source: z.enum(["WHATSAPP", "WEBSITE", "REFERRAL", "SOCIAL_MEDIA", "EMAIL", "PHONE", "OTHER"]).optional(),
  legalArea: z.string().optional(),
  caseSummary: z.string().optional(),
  stageId: z.string().optional(),
  assignedToId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get("stageId");
  const status = searchParams.get("status");
  const search = searchParams.get("q");

  const leads = await prisma.lead.findMany({
    where: {
      organizationId: orgId,
      ...(stageId && { stageId }),
      ...(status && { status: status as any }),
      NOT: [
        { phone: { contains: "@g.us" } },
        { phone: { contains: "-group" } },
        { phone: { contains: "group" } },
        { phone: { contains: "@broadcast" } },
      ],
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      }),
    },
    include: {
      stage: true,
      assignedTo: { select: { id: true, name: true, avatar: true } },
      _count: { select: { conversations: true, tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: leads });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as any).organizationId;
  const body = await req.json();
  const parsed = createLeadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  // Se não informou estágio, coloca no primeiro (new_lead)
  let stageId = parsed.data.stageId;
  if (!stageId) {
    const defaultStage = await prisma.kanbanStage.findFirst({
      where: { organizationId: orgId, slug: "new_lead" },
    });
    stageId = defaultStage?.id;
  }

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      stageId,
      organizationId: orgId,
    },
    include: { stage: true, assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ data: lead }, { status: 201 });
}
