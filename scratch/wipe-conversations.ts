/**
 * Apaga TODAS as conversas, mensagens e leads do banco.
 * Mantém: Client, Organization, AIConfig, KanbanStage, Task, Appointment,
 *         Notification (referências a Lead viram NULL).
 *
 * Uso:
 *   npx tsx scratch/wipe-conversations.ts            # dry-run (mostra contagens)
 *   npx tsx scratch/wipe-conversations.ts --confirm  # apaga de verdade
 *
 * AVISO: irreversível. Confira a DATABASE_URL antes de rodar com --confirm.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const [convCount, msgCount, leadCount, taskRefs, apptRefs, notifRefs] = await Promise.all([
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.lead.count(),
    prisma.task.count({ where: { leadId: { not: null } } }),
    prisma.appointment.count({ where: { leadId: { not: null } } }),
    prisma.notification.count({ where: { leadId: { not: null } } }),
  ]);

  console.log("Estado atual:");
  console.log(`  Conversation:        ${convCount}`);
  console.log(`  Message:             ${msgCount}`);
  console.log(`  Lead:                ${leadCount}`);
  console.log(`  Task com leadId:     ${taskRefs} (leadId será null)`);
  console.log(`  Appointment c/ lead: ${apptRefs} (leadId será null)`);
  console.log(`  Notification c/ lead:${notifRefs} (leadId será null)`);

  if (!CONFIRM) {
    console.log("\nDry-run. Nada apagado. Rode com --confirm para executar.");
    return;
  }

  console.log("\nExecutando wipe...");

  const result = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.deleteMany();
    const conv = await tx.conversation.deleteMany();
    const taskUpd = await tx.task.updateMany({ where: { leadId: { not: null } }, data: { leadId: null } });
    const apptUpd = await tx.appointment.updateMany({ where: { leadId: { not: null } }, data: { leadId: null } });
    const notifUpd = await tx.notification.updateMany({ where: { leadId: { not: null } }, data: { leadId: null } });
    const lead = await tx.lead.deleteMany();
    return { msg, conv, taskUpd, apptUpd, notifUpd, lead };
  });

  console.log(`Apagado: ${result.msg.count} mensagens, ${result.conv.count} conversas, ${result.lead.count} leads.`);
  console.log(`FK nulificadas: ${result.taskUpd.count} tasks, ${result.apptUpd.count} appointments, ${result.notifUpd.count} notifications.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
