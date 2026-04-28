import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findFirst();
  console.log(JSON.stringify(org));
}
main().catch(console.error).finally(() => prisma.$disconnect());
