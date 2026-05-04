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

const globalForPrisma = globalThis as unknown as { prismaDb: PrismaClient };

export const prisma = globalForPrisma.prismaDb ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaDb = prisma;
