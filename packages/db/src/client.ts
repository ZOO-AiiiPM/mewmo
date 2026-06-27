import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  mewmoPrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.mewmoPrisma) {
    const connectionString = process.env.DATABASE_URL ?? "postgresql://mewmo:mewmo@localhost:15432/mewmo_dev?schema=public";
    const adapter = new PrismaPg(connectionString);
    globalForPrisma.mewmoPrisma = new PrismaClient({ adapter, log: ["error"] });
  }

  return globalForPrisma.mewmoPrisma;
}

export { Prisma, PrismaClient };
