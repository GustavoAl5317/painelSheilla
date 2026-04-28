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
    { name: "Contato sem nome", phone: "5511976082634" },
    { name: "Contato sem nome", phone: "5511977690767" },
    { name: "Contato sem nome", phone: "5511982408500" },
    { name: "Contato sem nome", phone: "5511983826957" },
    { name: "Contato sem nome", phone: "5511985718835" },
    { name: "Contato sem nome", phone: "5511960665701" },
    { name: "Contato sem nome", phone: "5511973563509" },
    { name: "Contato sem nome", phone: "5511980546530" },
    { name: "Contato sem nome", phone: "5511977127356" },
    { name: "Contato sem nome", phone: "5511994366978" },
    { name: "Contato sem nome", phone: "5511952490808" },
    { name: "Contato sem nome", phone: "5511967327305" },
    { name: "Contato sem nome", phone: "5511933106294" },
    { name: "Contato sem nome", phone: "5511967120287" },
    { name: "Contato sem nome", phone: "5511980546530" },
    { name: "Contato sem nome", phone: "5511985157751" },
    { name: "Contato sem nome", phone: "5511987671363" },
    { name: "Contato sem nome", phone: "5511975756790" },
    { name: "Contato sem nome", phone: "5511995024272" },
    { name: "Contato sem nome", phone: "5511968340411" },
    { name: "Contato sem nome", phone: "5511958758904" },
    { name: "Contato sem nome", phone: "5511960297750" },
    { name: "Contato sem nome", phone: "5511953740230" },
    { name: "Contato sem nome", phone: "5511966735865" },
    { name: "Contato sem nome", phone: "5511972014673" },
    { name: "Contato sem nome", phone: "5511954253593" },
    { name: "Contato sem nome", phone: "5511998396704" },
    { name: "Contato sem nome", phone: "5511943434814" },
    { name: "Contato sem nome", phone: "5511977979633" },
    { name: "Contato sem nome", phone: "18608900360" },
    { name: "Contato sem nome", phone: "5511961356842" },
    { name: "Contato sem nome", phone: "5511952493337" },
    { name: "Contato sem nome", phone: "5511973772200" },
    { name: "Contato sem nome", phone: "5511970550581" },
    { name: "Contato sem nome", phone: "5511962053618" },
    { name: "Contato sem nome", phone: "5511976952997" },
    { name: "Contato sem nome", phone: "5511974314975" },
    { name: "Contato sem nome", phone: "5511971606936" },
    { name: "Contato sem nome", phone: "5511961288813" },
    { name: "Contato sem nome", phone: "5511973758001" },
    { name: "Contato sem nome", phone: "5511966677406" },
    { name: "Contato sem nome", phone: "5511962086603" },
    { name: "Contato sem nome", phone: "5511985425738" },
    { name: "Contato sem nome", phone: "5511984922517" },
    { name: "Contato sem nome", phone: "5511980396436" },
    { name: "Contato sem nome", phone: "5511968097333" },
    { name: "Contato sem nome", phone: "5511995872330" },
    { name: "Contato sem nome", phone: "5511984975081" },
    { name: "Contato sem nome", phone: "5512997482937" },
    { name: "Contato sem nome", phone: "5511957034622" },
    { name: "Contato sem nome", phone: "554388404390" },
    { name: "Contato sem nome", phone: "5511976445706" },
    { name: "Contato sem nome", phone: "5511952404783" },
    { name: "Contato sem nome", phone: "5511968333802" },
    { name: "Contato sem nome", phone: "5511998620704" },
    { name: "Contato sem nome", phone: "541998184443" }
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
