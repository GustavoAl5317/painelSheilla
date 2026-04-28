const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.conversation.findMany({
    where: {
      OR: [
        { phoneNumber: { contains: "group" } },
        { phoneNumber: { contains: "g.us" } },
      ],
    },
  });
  console.log("Groups in DB:", JSON.stringify(groups, null, 2));

  const some = await prisma.conversation.findMany({
    take: 10,
    orderBy: { lastMessageAt: "desc" },
  });
  console.log("Recent conversations:", JSON.stringify(some.map(c => c.phoneNumber), null, 2));
}

main();
