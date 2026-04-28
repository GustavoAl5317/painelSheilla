const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { pg } = require("pg");
require("dotenv").config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new (require("pg").Pool)({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const client = await prisma.client.findUnique({
    where: { id: "cmohepbml00050sr20kvqn6xx" }
  });
  console.log("CLIENT_DATA:" + JSON.stringify(client));
  await prisma.$disconnect();
}

main().catch(console.error);
