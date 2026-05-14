import { prisma } from "@/lib/prisma";

/**
 * Remove todos os clientes e processos da organização, com dependências mínimas.
 * Não remove leads, conversas ou usuários — apenas desvincula onde necessário.
 */
export async function resetOrgClientsAndProcesses(organizationId: string): Promise<{
  deletedProcesses: number;
  deletedClients: number;
}> {
  return prisma.$transaction(async tx => {
    await tx.caseCardEntry.deleteMany({
      where: { card: { organizationId } },
    });

    await tx.clientCaseCard.deleteMany({
      where: { organizationId },
    });

    await tx.task.updateMany({
      where: {
        organizationId,
        OR: [{ processId: { not: null } }, { clientId: { not: null } }],
      },
      data: { processId: null, clientId: null },
    });

    await tx.appointment.updateMany({
      where: { organizationId },
      data: { processId: null, clientId: null },
    });

    await tx.conversation.updateMany({
      where: { organizationId, clientId: { not: null } },
      data: { clientId: null },
    });

    await tx.lead.updateMany({
      where: { organizationId, clientId: { not: null } },
      data: { clientId: null },
    });

    const proc = await tx.process.deleteMany({ where: { organizationId } });
    const cli = await tx.client.deleteMany({ where: { organizationId } });

    return { deletedProcesses: proc.count, deletedClients: cli.count };
  });
}
