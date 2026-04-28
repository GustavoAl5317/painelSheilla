const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
require("dotenv").config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const orgId = "cmohk26l00004a4r2lxjsvgwo";
  const config = await prisma.aIConfig.findUnique({ where: { organizationId: orgId } });
  
  let existingContacts = [];
  if (config && config.blockedNumbers) {
    existingContacts = Array.isArray(config.blockedNumbers) ? config.blockedNumbers : [];
  }

  const newContactsRaw = [
    { name: "Contato sem nome", phone: "5511965016276" },
    { name: "Contato sem nome", phone: "5511981412570" },
    { name: "Contato sem nome", phone: "551983486792" },
    { name: "Contato sem nome", phone: "5511986134164" },
    { name: "Contato sem nome", phone: "5511963629903" },
    { name: "Contato sem nome", phone: "5511913620770" },
    { name: "Contato sem nome", phone: "5511978059176" },
    { name: "Contato sem nome", phone: "5511967138760" },
    { name: "Contato sem nome", phone: "5511943241819" },
    { name: "Contato sem nome", phone: "5511995356085" },
    { name: "Contato sem nome", phone: "5519878797916" },
    { name: "Contato sem nome", phone: "5511989393955" },
    { name: "Contato sem nome", phone: "5511920928176" },
    { name: "Contato sem nome", phone: "5511983529492" },
    { name: "Contato sem nome", phone: "5511947275194" },
    { name: "Contato sem nome", phone: "5511990214758" },
    { name: "Contato sem nome", phone: "5511996332432" },
    { name: "Contato sem nome", phone: "5543996454517" },
    { name: "Contato sem nome", phone: "5511992624480" },
    { name: "Contato sem nome", phone: "15084056300" },
    { name: "Contato sem nome", phone: "5511996025288" },
    { name: "Contato sem nome", phone: "5511979909960" },
    { name: "Contato sem nome", phone: "5511966042055" },
    { name: "Contato sem nome", phone: "5511980359082" }
  ];

  const merged = [...existingContacts];
  let addedCount = 0;

  for (const contact of newContactsRaw) {
    if (!merged.find(c => c.phone === contact.phone)) {
      merged.push(contact);
      addedCount++;
    }
  }

  await prisma.aIConfig.update({
    where: { organizationId: orgId },
    data: { blockedNumbers: merged }
  });

  console.log(`SUCCESS: Merged ${addedCount} new unique contacts. Total in list: ${merged.length}.`);
  await prisma.$disconnect();
}

main().catch(console.error);
