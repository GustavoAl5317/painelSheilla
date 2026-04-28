import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  defaultGreeting: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const orgId = (session.user as { organizationId: string }).organizationId;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  return NextResponse.json({ data: org });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const orgId = (session.user as { organizationId: string }).organizationId;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true, data: org });
}
