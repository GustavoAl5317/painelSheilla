/**
 * Limpa conversas-fantasma criadas por bug no parser de webhook (antes do fix).
 *
 * Critérios (qualquer um):
 *  1. phoneNumber tem mais de 13 dígitos (não é telefone real, é JID/ID interno)
 *  2. Conversa não tem nenhuma mensagem INBOUND (só do operador → fantasma)
 *
 * Uso:
 *   npx tsx scratch/cleanup-fantasma-conversations.ts            # dry-run (não apaga)
 *   npx tsx scratch/cleanup-fantasma-conversations.ts --confirm  # apaga de verdade
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const all = await prisma.conversation.findMany({
    select: {
      id: true,
      phoneNumber: true,
      organizationId: true,
      leadId: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const fantasmas: Array<{
    id: string;
    phoneNumber: string;
    leadId: string | null;
    reason: string;
    messageCount: number;
  }> = [];

  for (const c of all) {
    const reasons: string[] = [];

    if (c.phoneNumber.length > 13) {
      reasons.push(`phone=${c.phoneNumber} (${c.phoneNumber.length} dígitos)`);
    }

    const inboundCount = await prisma.message.count({
      where: { conversationId: c.id, direction: "INBOUND" },
    });
    if (inboundCount === 0 && c._count.messages > 0) {
      reasons.push(`sem mensagens INBOUND (${c._count.messages} total)`);
    } else if (c._count.messages === 0) {
      reasons.push("sem nenhuma mensagem");
    }

    if (reasons.length > 0) {
      fantasmas.push({
        id: c.id,
        phoneNumber: c.phoneNumber,
        leadId: c.leadId,
        reason: reasons.join(" | "),
        messageCount: c._count.messages,
      });
    }
  }

  console.log(`\nTotal de conversas analisadas: ${all.length}`);
  console.log(`Conversas fantasma encontradas: ${fantasmas.length}\n`);

  for (const f of fantasmas) {
    console.log(
      `  - id=${f.id} phone=${f.phoneNumber} msgs=${f.messageCount} leadId=${f.leadId ?? "-"} | ${f.reason}`
    );
  }

  if (fantasmas.length === 0) {
    console.log("\nNada para limpar.");
    return;
  }

  if (!CONFIRM) {
    console.log("\n[DRY-RUN] Nenhum dado foi apagado. Rode novamente com --confirm para apagar.");
    return;
  }

  console.log("\n[APAGANDO...]");
  let deletedConv = 0;
  let deletedLead = 0;

  for (const f of fantasmas) {
    // Mensagens são apagadas em cascata (onDelete: Cascade no Message → Conversation)
    await prisma.conversation.delete({ where: { id: f.id } });
    deletedConv++;

    if (f.leadId) {
      // Só apaga o lead se ele não tiver outras conversas vivas
      const otherConvs = await prisma.conversation.count({
        where: { leadId: f.leadId },
      });
      if (otherConvs === 0) {
        try {
          await prisma.lead.delete({ where: { id: f.leadId } });
          deletedLead++;
        } catch (e: any) {
          console.warn(`  ! falha ao apagar lead ${f.leadId}: ${e.message}`);
        }
      }
    }
  }

  console.log(`\nConversas apagadas: ${deletedConv}`);
  console.log(`Leads órfãos apagados: ${deletedLead}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
