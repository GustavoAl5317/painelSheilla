const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { pg } = require("pg");
const { createCipheriv, randomBytes } = require("crypto");
require("dotenv").config();

function getEncryptionKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "advzap-dev-secret-change-in-production";
  return Buffer.from(secret.padEnd(32, "0").slice(0, 32), "utf8");
}

function encryptCredential(plaintext) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new (require("pg").Pool)({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const slug = "sheila-araujo-adv";
  const token = "zYVqQ3uUDJ6JSbmuB2HLLSqbZuUes35csp73iQHJQ3zP";
  
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    console.error("Organization not found");
    return;
  }
  
  const encrypted = encryptCredential(token);
  
  await prisma.orgCredential.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "TRAMITACAO_API_KEY" } },
    update: { value: encrypted },
    create: { organizationId: org.id, key: "TRAMITACAO_API_KEY", value: encrypted }
  });
  
  console.log("SUCCESS: TRAMITACAO_API_KEY saved for organization " + org.name);
  await prisma.$disconnect();
}

main().catch(console.error);
