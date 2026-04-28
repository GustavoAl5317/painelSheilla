const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
require("dotenv").config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const configs = await prisma.aIConfig.findMany();
  console.log("CONFIGS_DATA:", JSON.stringify(configs.map(x => ({
    id: x.id,
    orgId: x.organizationId,
    blockedNumbers: x.blockedNumbers
  }))));
  await prisma.$disconnect();
}

main().catch(console.error);
