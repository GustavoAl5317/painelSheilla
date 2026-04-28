const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { createDecipheriv } = require("crypto");
require("dotenv").config();

function getEncryptionKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "advzap-dev-secret-change-in-production";
  return Buffer.from(secret.padEnd(32, "0").slice(0, 32), "utf8");
}

function decryptCredential(ciphertext) {
  const key = getEncryptionKey();
  const [ivB64, tagB64, encryptedB64] = ciphertext.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new (require("pg").Pool)({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const cred = await prisma.orgCredential.findFirst({
    where: { key: "TRAMITACAO_API_KEY", organizationId: "cmoh9ibva0004tkr2o1cxmiap" }
  });
  
  if (cred) {
    console.log("DECRYPTED_KEY:" + decryptCredential(cred.value));
  } else {
    console.log("NOT_FOUND");
  }
  await prisma.$disconnect();
}

main().catch(console.error);
