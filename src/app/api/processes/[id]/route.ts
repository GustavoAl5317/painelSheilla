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
    const [process] = await prisma.$transaction(async (tx) => {
      const updated = await tx.process.update({
        where: { id, organizationId: orgId },
        data: {
          ...parsed.data,
          nextHearing: parsed.data.nextHearing ? new Date(parsed.data.nextHearing) : (parsed.data.nextHearing === null ? null : undefined),
        },
      });

      if ("clientId" in parsed.data) {
        const newClientId = parsed.data.clientId;

        if (newClientId) {
          // Desvincula qualquer card antigo que aponte para este processo
          await tx.clientCaseCard.updateMany({
            where: { processId: id, clientId: { not: newClientId } },
            data: { processId: null },
          });
          // Vincula (ou cria) o card do novo cliente
          await tx.clientCaseCard.upsert({
            where: { clientId: newClientId },
            create: { organizationId: orgId, clientId: newClientId, processId: id },
            update: { processId: id },
          });
        } else {
          // clientId removido: limpa processId de todos os cards vinculados
          await tx.clientCaseCard.updateMany({
            where: { processId: id },
            data: { processId: null },
          });
        }
      }

      return [updated];
    });

    return NextResponse.json({ data: process });
  } catch (error) {
    console.error("Error updating process:", error);
    return NextResponse.json({ error: "Erro ao atualizar processo" }, { status: 500 });
  }
}
