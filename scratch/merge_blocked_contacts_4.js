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
    { name: "Contato sem nome", phone: "5511996925460" },
    { name: "Contato sem nome", phone: "5511975398360" },
    { name: "Contato sem nome", phone: "5511947239761" },
    { name: "Contato sem nome", phone: "5511955880693" },
    { name: "Contato sem nome", phone: "5511980399316" },
    { name: "Contato sem nome", phone: "5511969689544" },
    { name: "Contato sem nome", phone: "5511964202020" },
    { name: "Contato sem nome", phone: "5511982373037" },
    { name: "Contato sem nome", phone: "5511940177747" },
    { name: "Contato sem nome", phone: "5511964542910" },
    { name: "Contato sem nome", phone: "5511982767541" },
    { name: "Contato sem nome", phone: "17813001551" },
    { name: "Contato sem nome", phone: "5511992311001" },
    { name: "Contato sem nome", phone: "5511996088939" },
    { name: "Contato sem nome", phone: "5511948170787" },
    { name: "Contato sem nome", phone: "5511981554076" },
    { name: "Contato sem nome", phone: "5511956519192" },
    { name: "Contato sem nome", phone: "5511983551728" },
    { name: "Contato sem nome", phone: "5511955208147" },
    { name: "Contato sem nome", phone: "5511981036250" },
    { name: "Contato sem nome", phone: "5511921629101" },
    { name: "Contato sem nome", phone: "5561993726593" },
    { name: "Contato sem nome", phone: "5511932950218" },
    { name: "Contato sem nome", phone: "5511948060742" },
    { name: "Contato sem nome", phone: "5511984269654" },
    { name: "Contato sem nome", phone: "5511995881590" },
    { name: "Contato sem nome", phone: "5511962331244" },
    { name: "Contato sem nome", phone: "5511989763740" },
    { name: "Contato sem nome", phone: "5511984675710" },
    { name: "Contato sem nome", phone: "5511913475092" },
    { name: "Contato sem nome", phone: "5511986618407" },
    { name: "Contato sem nome", phone: "5511960637878" },
    { name: "Contato sem nome", phone: "5511986207048" },
    { name: "Contato sem nome", phone: "5511981168601" },
    { name: "Contato sem nome", phone: "5511991076529" },
    { name: "Contato sem nome", phone: "5511967358139" },
    { name: "Contato sem nome", phone: "5511945287651" },
    { name: "Contato sem nome", phone: "5511982837969" },
    { name: "Contato sem nome", phone: "5511999260211" },
    { name: "Contato sem nome", phone: "5511960149903" },
    { name: "Contato sem nome", phone: "5511965089385" },
    { name: "Contato sem nome", phone: "5511948990654" },
    { name: "Contato sem nome", phone: "5511961305623" },
    { name: "Contato sem nome", phone: "5511968750705" },
    { name: "Contato sem nome", phone: "5511985995458" },
    { name: "Contato sem nome", phone: "5511958716569" },
    { name: "Contato sem nome", phone: "5511942508736" },
    { name: "Contato sem nome", phone: "5511984286480" },
    { name: "Contato sem nome", phone: "553399371213" },
    { name: "Contato sem nome", phone: "5511961488777" },
    { name: "Contato sem nome", phone: "5511967767963" },
    { name: "Contato sem nome", phone: "5511912320167" },
    { name: "Contato sem nome", phone: "5511984000688" },
    { name: "Contato sem nome", phone: "5511949278761" },
    { name: "Contato sem nome", phone: "5511958084947" },
    { name: "Contato sem nome", phone: "5511912439736" },
    { name: "Contato sem nome", phone: "5511950231082" },
    { name: "Contato sem nome", phone: "5511952040950" },
    { name: "Contato sem nome", phone: "5511961573808" },
    { name: "Contato sem nome", phone: "5511956974674" },
    { name: "Contato sem nome", phone: "5511910648004" },
    { name: "Contato sem nome", phone: "5511967369958" },
    { name: "Contato sem nome", phone: "5533999371213" },
    { name: "Contato sem nome", phone: "5511966833068" },
    { name: "Contato sem nome", phone: "5511949491251" },
    { name: "Contato sem nome", phone: "5511982512552" },
    { name: "Contato sem nome", phone: "5511943669397" },
    { name: "Contato sem nome", phone: "5511958663850" },
    { name: "Contato sem nome", phone: "5511962931828" },
    { name: "Contato sem nome", phone: "5511964237070" },
    { name: "Contato sem nome", phone: "5511962779246" }
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
