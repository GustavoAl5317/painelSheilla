import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { trelloSyncClientCard } from "@/lib/adapters/trello-adapter";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const orgId = (session.user as { organizationId: string }).organizationId;
  const { id } = await params;

  try {
    const client = await prisma.client.findFirst({
      where: { id, organizationId: orgId },
      include: {
        processes: {
          take: 1,
          orderBy: { createdAt: "desc" },
        }
      }
    });

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const process = client.processes[0];

    const result = await trelloSyncClientCard(orgId, {
      name: client.name,
      contactNumber: client.phone ?? "",
      cpf: client.cpf ?? undefined,
      email: client.email ?? undefined,
      legalArea: process?.legalArea ?? undefined,
      notes: client.notes ?? undefined,
      tramitacaoCustomerId: client.tramitacaoCustomerId ?? undefined,
    });

    await prisma.client.update({
      where: { id: client.id },
      data: {
        trelloCardId: result.id,
        trelloCardUrl: result.shortUrl,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/clients/trello] Error:", err);
    const message = err instanceof Error ? err.message : "Erro interno no servidor";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
