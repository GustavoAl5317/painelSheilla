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
    { name: "FERNANDO RAMIRO", phone: "5511969723039" },
    { name: "VENANCIO", phone: "5511958997409" },
    { name: "MARIA HORTOLANDIA", phone: "5519983831261" },
    { name: "DANI TOUR", phone: "11959536196" },
    { name: "PASTORA KAREN", phone: "5515996541476" },
    { name: "MARCIA THABATA", phone: "55119666715795" },
    { name: "JOSIANE YOLANDA", phone: "5511982001595" },
    { name: "dra aline _deficientes _oab", phone: "5511996186596" },
    { name: "DR BRUNA MKT", phone: "5511940337960" },
    { name: "DEBORAH IGREJA", phone: "5511982157470" },
    { name: "DR DIEGO", phone: "1155979521579" },
    { name: "DRA ZURITA", phone: "119940115709" },
    { name: "GABRIELA TARGINO", phone: "5511942121718" },
    { name: "PASTOR ISMAEL", phone: "5513997281211" },
    { name: "DR FELIPE SERRA", phone: "5511960304655" },
    { name: "DR GILMAR", phone: "5511976965065" },
    { name: "CARLOS CHACARA", phone: "5511971690656" },
    { name: "CIDA TIDA", phone: "5511934987612" },
    { name: "FE", phone: "18604028961" },
    { name: "EMILLY VINCULO MENOR", phone: "5511993614077" },
    { name: "VANIA MOTOBOY", phone: "5511958545537" },
    { name: "GEMEAS MENINOS", phone: "5511973919314" },
    { name: "JONATAS FALCAO", phone: "5511959677356" },
    { name: "BRUNO INQ FERNANDO", phone: "5511982694349" },
    { name: "DR MARCELO", phone: "5511972836474" },
    { name: "JAQUE TERRY", phone: "5511995047129" },
    { name: "LOREN", phone: "5511961714575" },
    { name: "MARIVANIA", phone: "5511992365116" },
    { name: "DANI _ANA_CINIRA", phone: "5511999079318" },
    { name: "ADRIENE_ZACARIAS", phone: "5519999242624" },
    { name: "CAROL_ANA_CLAUDIO", phone: "5511967875107" },
    { name: "ANA REGINA", phone: "5511964561219" },
    { name: "DILCEMAR MACHADO", phone: "5511941209348" },
    { name: "CLAUDIO LINO_ CLIENTE", phone: "5511975558555" },
    { name: "DR MATOS", phone: "5511984145002" },
    { name: "ANA CAROLINA GESTANTE", phone: "5511942937364" },
    { name: "VANESSA_RESCISAO INDIRETA", phone: "5511959923323" },
    { name: "JONAS _CLIENTE_RESCISOA INDIRETA", phone: "5511983384464" },
    { name: "ROBSON BOLSONARO", phone: "5511993712707" },
    { name: "Jose Salgado", phone: "5511968927284" },
    { name: "Contato sem nome", phone: "5511972947251" },
    { name: "Contato sem nome", phone: "5511957450113" },
    { name: "Contato sem nome", phone: "5511940160126" },
    { name: "Contato sem nome", phone: "5511977614328" },
    { name: "Contato sem nome", phone: "5511967063668" },
    { name: "Contato sem nome", phone: "5511953863589" },
    { name: "Contato sem nome", phone: "5511995187374" },
    { name: "Contato sem nome", phone: "5511996299926" },
    { name: "Contato sem nome", phone: "5511968716597" },
    { name: "Contato sem nome", phone: "5511980686793" },
    { name: "Contato sem nome", phone: "5511982066444" },
    { name: "Contato sem nome", phone: "554391529202" },
    { name: "Contato sem nome", phone: "5511997371292" },
    { name: "Contato sem nome", phone: "5511963425363" },
    { name: "Contato sem nome", phone: "557399211785" },
    { name: "Contato sem nome", phone: "5511943732483" },
    { name: "Contato sem nome", phone: "5511987109881" },
    { name: "Contato sem nome", phone: "5511999671638" },
    { name: "Contato sem nome", phone: "5511981423478" },
    { name: "Contato sem nome", phone: "5511999425514" },
    { name: "Contato sem nome", phone: "5511991177873" },
    { name: "Contato sem nome", phone: "5511948685194" },
    { name: "Contato sem nome", phone: "5511982095507" },
    { name: "Contato sem nome", phone: "5511980546530" },
    { name: "Contato sem nome", phone: "5511982440096" },
    { name: "Contato sem nome", phone: "5511960711851" },
    { name: "Contato sem nome", phone: "5511993989758" },
    { name: "Contato sem nome", phone: "5511996822235" },
    { name: "Contato sem nome", phone: "5511948453758" },
    { name: "Contato sem nome", phone: "5511954594692" },
    { name: "Contato sem nome", phone: "5511968084317" },
    { name: "Contato sem nome", phone: "5511980546530" }
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
