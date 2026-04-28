import { prisma } from "@/lib/prisma";

/**
 * Tenta achar o cliente do escritório pelo número do WhatsApp (vários formatos).
 */
export async function findClientIdByOrgPhone(organizationId: string, phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const last9 = withoutCountry.slice(-9);

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
  return found?.id ?? null;
}
