const { PrismaClient } = require("@prisma/client");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  try {
    const all = await prisma.conversation.findMany({
      select: { phoneNumber: true, status: true },
    });
    console.log("All Phone Numbers in DB:");
    all.forEach(c => console.log(`- ${c.phoneNumber} (${c.status})`));

    const groups = all.filter(c => c.phoneNumber.includes("group") || c.phoneNumber.includes("g.us"));
    console.log("\nGroups found:", JSON.stringify(groups, null, 2));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
