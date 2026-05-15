import { prisma } from "@/lib/prisma";

/**
 * Tenta achar o cliente do escritório pelo número do WhatsApp (vários formatos).
 * Usa busca por substring primeiro (rápida) e, como fallback, SQL que remove
 * caracteres não-numéricos do campo salvo — cobre números formatados como
 * "(11) 96961-7333" que não batem com "5511969617333" por substring simples.
 */
export async function findClientIdByOrgPhone(organizationId: string, phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const last9 = withoutCountry.slice(-9);

  // Busca rápida por substring (funciona quando o número está sem formatação)
  const found = await prisma.client.findFirst({
    where: {
      organizationId,
      OR: [
        { phone: { contains: digits } },
        { phone: { contains: withoutCountry } },
        { phone: { contains: last9 } },
      ],
    },
    select: { id: true },
  });
  if (found) return found.id;

  // Fallback: compara apenas os dígitos do número salvo (cobre formatação com
  // parênteses, hífens, espaços, etc.)
  const raw = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Client"
    WHERE "organizationId" = ${organizationId}
      AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + last9}
    LIMIT 1
  `;
  return raw[0]?.id ?? null;
}
