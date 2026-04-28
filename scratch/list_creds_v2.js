const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { pg } = require("pg");
require("dotenv").config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new (require("pg").Pool)({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const creds = await prisma.orgCredential.findMany({
    where: { organizationId: "cmoh9ibva0004tkr2o1cxmiap" }
  });
  console.log("CREDS:" + JSON.stringify(creds));
  await prisma.$disconnect();
}

main().catch(console.error);
