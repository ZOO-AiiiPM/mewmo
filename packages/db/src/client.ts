import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  mewmoPrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.mewmoPrisma) {
    globalForPrisma.mewmoPrisma = new PrismaClient({ log: ["error"] });
  }

  return globalForPrisma.mewmoPrisma;
}

export { Prisma, PrismaClient };
