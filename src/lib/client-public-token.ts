import "server-only";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function ensureClientPublicToken(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { publicToken: true },
  });

  if (client?.publicToken) return client.publicToken;

  const token = randomBytes(24).toString("hex");
  await prisma.client.update({ where: { id: clientId }, data: { publicToken: token } });
  return token;
}
