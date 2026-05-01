import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "../src/lib/prisma";

const newNumbers = [
  "5511947519471", "5511983728493", "5511993500405", "5511950784909", "5511987921383",
  "5511977600830", "5511983899327", "5511949195762", "5511989851379", "5511986420472",
  "5511987567207", "5511982891609", "5511975229965", "5511967063668", "5511977614328",
  "5511957450113", "5511972947251", "5511985229240", "5511970600291", "5511957936851",
  "5511966615620", "5511991177873", "5511981423478", "5511987109881", "5511943732483",
  "554391529202", "5511982066444", "5511968716597", "5511996299926", "5511984922517",
  "5511966677406", "5511974314975", "5511970550581", "5511998396704", "5511966735865",
  "5511968340411", "5511987671363", "5511977686685", "5511930123552", "5511981664406",
  "5511982311001", "5511986800609", "5511947527061", "5511952404783", "5512997482937",
  "5511997371292", "5511980686793", "5511953863589", "5511940160126", "554188464750",
  "5511984482101", "5511919877837", "5511995792676", "5511962352040", "5511968333802",
  "5511980396436", "5511971606936", "5511943434814", "5511958758904", "5511948685194",
  "5511999671638"
];

async function main() {
  const configs = await prisma.aIConfig.findMany();
  
  for (const config of configs) {
    let currentBlocked: any[] = (config.blockedNumbers as any) || [];
    if (typeof currentBlocked === "string") currentBlocked = JSON.parse(currentBlocked);

    const newEntries = newNumbers
      .filter(num => !currentBlocked.some((b: any) => b.phone === num))
      .map(num => ({ phone: num, name: "Contato sem nome" }));
    
    if (newEntries.length === 0) {
      console.log(`Config ${config.id}: Already up to date.`);
      continue;
    }

    const updatedBlocked = [...currentBlocked, ...newEntries];

    await prisma.aIConfig.update({
      where: { id: config.id },
      data: { blockedNumbers: updatedBlocked as any }
    });
    
    console.log(`Updated block list for config ${config.id}. Added ${newEntries.length} new numbers.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
