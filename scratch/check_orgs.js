const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
require("dotenv").config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const orgs = await prisma.organization.findMany({ select: { id: true, slug: true, name: true } });
  console.log("DATA_ORGS:", JSON.stringify(orgs));
  await prisma.$disconnect();
}

main().catch(console.error);
