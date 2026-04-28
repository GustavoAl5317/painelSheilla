const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const creds = await prisma.orgCredential.findMany({
    where: { key: { contains: "TRAMITACAO" } }
  });
  console.log(JSON.stringify(creds, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
