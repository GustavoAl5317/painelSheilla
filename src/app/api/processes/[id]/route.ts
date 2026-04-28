import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateProcessSchema = z.object({
  number: z.string().optional(),
  title: z.string().optional(),
  court: z.string().optional(),
  legalArea: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED", "CONCLUDED"]).optional(),
  observations: z.string().optional(),
  nextHearing: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const orgId = (session.user as any).organizationId;
  const body = await req.json();

  const parsed = updateProcessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const process = await prisma.process.update({
      where: { id, organizationId: orgId },
      data: {
        ...parsed.data,
        nextHearing: parsed.data.nextHearing ? new Date(parsed.data.nextHearing) : (parsed.data.nextHearing === null ? null : undefined),
      },
    });

    return NextResponse.json({ data: process });
  } catch (error) {
    console.error("Error updating process:", error);
    return NextResponse.json({ error: "Erro ao atualizar processo" }, { status: 500 });
  }
}
