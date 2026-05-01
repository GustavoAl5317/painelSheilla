const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const newNumbers = [
  "5511977979633", "5511982095507", "5511963425363", "5511995187374", "5511959426755",
  "5511949057425", "5511975226600", "5511964604519", "5511997278375", "5511999779942",
  "18608900360", "557399211785", "17814593002", "5511948247597", "5511964214837",
  "5511968097333", "5511985604166", "5511930666367", "5511966562905", "5511983507946",
  "557182862912", "5511977475071", "5511196779992", "5511961356842", "5511939477241",
  "5511981526049", "5511952538632", "5511956504004", "5511984748659", "5511954580382",
  "5511992107575", "5521969632220", "5521971399620", "5511932445482", "5511954797177",
  "5511981829373", "5511966425638", "5511992197881", "5511958872085", "5511952864365",
  "5511996332432", "5543996454517", "5511992624480", "15084056300", "5511996025288",
  "5511979909960", "5511966042055", "5511980359082", "5511943241819", "5511995356085",
  "5519878797916", "5511989393955", "5511920928176", "5511983529492", "5511947275194",
  "5511990214758", "5511965016276", "5511981412570", "551983486792", "5511986134164",
  "5511963629903", "5511913620770", "5511978059176", "5511967138760"
];

async function main() {
  const configs = await prisma.aIConfig.findMany();
  
  for (const config of configs) {
    let currentBlocked = config.blockedNumbers || [];
    if (typeof currentBlocked === "string") currentBlocked = JSON.parse(currentBlocked);

    const newEntries = newNumbers
      .filter(num => !currentBlocked.some(b => b.phone === num))
      .map(num => ({ phone: num, name: "Contato sem nome" }));
    
    if (newEntries.length === 0) {
      console.log(`Config ${config.id}: Already up to date.`);
      continue;
    }

    const updatedBlocked = [...currentBlocked, ...newEntries];

    await prisma.aIConfig.update({
      where: { id: config.id },
      data: { blockedNumbers: updatedBlocked }
    });
    
    console.log(`Updated block list for config ${config.id}. Added ${newEntries.length} new numbers.`);
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
