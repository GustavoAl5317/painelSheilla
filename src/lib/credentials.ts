import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { CredentialKey } from "@/lib/credentials-config";
import { CREDENTIAL_DEFINITIONS } from "@/lib/credentials-config";

// Re-exporta os tipos para que arquivos server possam importar tudo daqui
export type { CredentialKey };
export { CREDENTIAL_DEFINITIONS, CREDENTIAL_GROUPS } from "@/lib/credentials-config";

// ─── Criptografia AES-256-GCM ───────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const secret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "advzap-dev-secret-change-in-production";
  return Buffer.from(secret.padEnd(32, "0").slice(0, 32), "utf8");
}

export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptCredential(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivB64, tagB64, encryptedB64] = ciphertext.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

// ─── Resolver: DB primeiro, .env como fallback global ───────────────────────

export async function resolveCredential(
  organizationId: string,
  key: CredentialKey
): Promise<string | null> {
  try {
    const cred = await prisma.orgCredential.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (cred?.value) return decryptCredential(cred.value);
  } catch {
    // DB não disponível — usa fallback de env
  }

  const meta = CREDENTIAL_DEFINITIONS.find((c) => c.key === key);
  if (meta?.envFallback) return process.env[meta.envFallback] ?? null;

  return null;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function saveCredential(organizationId: string, key: CredentialKey, value: string) {
  const encrypted = encryptCredential(value);
  return prisma.orgCredential.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { value: encrypted },
    create: { organizationId, key, value: encrypted },
  });
}

export async function deleteCredential(organizationId: string, key: CredentialKey) {
  return prisma.orgCredential.deleteMany({ where: { organizationId, key } });
}

export async function listCredentials(organizationId: string) {
  const records = await prisma.orgCredential.findMany({
    where: { organizationId },
    select: { key: true, updatedAt: true },
    orderBy: { key: "asc" },
  });
  return records.map((r) => ({ key: r.key, configured: true, updatedAt: r.updatedAt }));
}
