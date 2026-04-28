import * as dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  console.log("Iniciando reset de leads e kanban...");

  // Ordem: dependentes primeiro
  const r1 = await prisma.notification.deleteMany({ where: { leadId: { not: null } } });
  console.log(`Notificações de leads: ${r1.count}`);

  const r2 = await prisma.message.deleteMany({});
  console.log(`Mensagens: ${r2.count}`);

  const r3 = await prisma.conversation.deleteMany({});
  console.log(`Conversas: ${r3.count}`);

  const r4 = await prisma.task.deleteMany({ where: { leadId: { not: null } } });
  console.log(`Tarefas de leads: ${r4.count}`);

  const r5 = await prisma.lead.deleteMany({});
  console.log(`Leads: ${r5.count}`);

  const r6 = await prisma.kanbanStage.deleteMany({});
  console.log(`Estágios Kanban: ${r6.count}`);

  console.log("\nReset concluído.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
