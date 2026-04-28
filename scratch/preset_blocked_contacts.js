const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { pg } = require("pg");
require("dotenv").config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new (require("pg").Pool)({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const orgId = "cmohk26l00004a4r2lxjsvgwo";
  const contacts = [
    { name: "DR RAMOM", phone: "5521991690886" },
    { name: "DIOGO JONAS", phone: "5511947912079" },
    { name: "DRA TANAKA", phone: "5511913517754" },
    { name: "DARCI", phone: "17818565780" },
    { name: "DRA PADARIA", phone: "5511940115709" },
    { name: "CAFE", phone: "5511955560486" },
    { name: "PONDE", phone: "5511910550000" },
    { name: "MARCOS INCAPACIDADE", phone: "5511987820156" },
    { name: "ELAINE RIOS ISAAC FELIX", phone: "5511949393714" },
    { name: "CHRISTIAN", phone: "5511958965128" },
    { name: "MANOEL PARCEIRO", phone: "5511994756835" },
    { name: "SAMUEL ARLINDO", phone: "5511970755454" },
    { name: "CARMEM GOIS", phone: "5511951467706" },
    { name: "EDSON DUARTE", phone: "5511948113081" },
    { name: "GISELE MIRALDINA", phone: "5511948578476" },
    { name: "IRMAO ELENILSON", phone: "5511982567334" },
    { name: "FRANCIEUDES", phone: "5511997118094" },
    { name: "CRISTIANE ESCOLA", phone: "5511966951230" },
    { name: "DRA CAMILA MALTESI", phone: "5511931310555" },
    { name: "DRA ANA LIBARINO", phone: "5511998982427" },
    { name: "JUNIOR MISTER PRATO", phone: "5511947153881" },
    { name: "EDJANE LOAS", phone: "5511960321445" },
    { name: "EVA LOPES", phone: "5511957077195" },
    { name: "DR OTAVIO MEDICO", phone: "5511971618528" },
    { name: "ANA CAROLINA RESCISAO INDIRETA", phone: "5511983764844" },
    { name: "TATIANA GOIS", phone: "5511982204801" },
    { name: "ELIETE VIZINHA", phone: "5511985555881" },
    { name: "KETLYN ESPOSA MARCOS", phone: "5511940522101" },
    { name: "MARCOS ZERONZE", phone: "5511984246530" },
    { name: "DR MATOSINHO", phone: "5511992745252" },
    { name: "DRA JULIANA LUPPI", phone: "5511937543474" },
    { name: "POLIANA MARCILENE", phone: "5511983312314" },
    { name: "DRA KALY", phone: "5511966586810" },
    { name: "RODRIGO BRASIL", phone: "5511985975505" },
    { name: "DR RICARDO BRITO", phone: "5511997560548" },
    { name: "DRA VIVIANE EESSCRIBANO", phone: "5511979772775" },
    { name: "DR RODNEY", phone: "5511912227040" },
    { name: "ANDREZA MATERNIDADE", phone: "5562998543424" },
    { name: "DRA JULIANA PENAL OAB", phone: "5511953601002" },
    { name: "ANDERSON USA", phone: "12175711274" }
  ];

  await prisma.aIConfig.upsert({
    where: { organizationId: orgId },
    update: { blockedNumbers: contacts },
    create: { 
      organizationId: orgId, 
      blockedNumbers: contacts,
      isActive: true,
      provider: "OPENAI",
      model: "gpt-4o-mini"
    }
  });

  console.log(`SUCCESS: ${contacts.length} contacts pre-set in mass block list.`);
  await prisma.$disconnect();
}

main().catch(console.error);
