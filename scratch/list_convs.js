const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    const all = await prisma.conversation.findMany({
      select: { phoneNumber: true, lead: { select: { name: true } } },
      take: 50,
      orderBy: { lastMessageAt: "desc" }
    });
    console.log("CONVERSATIONS:");
    all.forEach(c => {
      console.log(`Phone: ${c.phoneNumber} | Name: ${c.lead?.name}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
