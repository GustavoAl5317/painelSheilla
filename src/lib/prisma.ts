import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida no .env");

  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prismaDb?: PrismaClient };

// Lazy proxy: o cliente só é instanciado no primeiro uso. Isso evita que `next build`
// quebre durante "Collecting page data" quando DATABASE_URL não está disponível
// (ex.: preview deploys), já que o módulo é importado por rotas dinâmicas.
function getClient(): PrismaClient {
  if (!globalForPrisma.prismaDb) {
    globalForPrisma.prismaDb = createPrismaClient();
  }
  return globalForPrisma.prismaDb;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
