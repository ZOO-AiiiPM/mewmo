import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  mewmoPrisma?: PrismaClient;
};

// Backoff before each retry. Length = number of retries. Values chosen to ride
// out Neon serverless cold-start wake-up latency (compute suspends when idle,
// so the first query after inactivity can fail while the instance boots).
const RETRY_DELAYS_MS = [1000, 2000, 3000];

/**
 * Only connection-phase failures are safe to retry: when the client can't reach
 * or is dropped by the server, the query never executed, so re-running it has no
 * side effect. Query-level errors (unique violations, validation, etc.) must not
 * be retried, or we risk masking real failures and duplicating writes.
 */
function isTransientConnectionError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && ["P1000", "P1001", "P1002", "P1008", "P1017"].includes(code)) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("can't reach database server") ||
    message.includes("connection") ||
    message.includes("timed out") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("closed the connection") ||
    message.includes("terminating connection")
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries every operation on transient connection errors with fixed backoff
 * (1s, 2s, 3s). This is the single choke point for all DB access across web and
 * agent, so the whole app tolerates Neon cold starts instead of failing the
 * first request after an idle period.
 */
const retryExtension = Prisma.defineExtension({
  name: "transient-connection-retry",
  query: {
    async $allOperations({ args, query }) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          return await query(args);
        } catch (error) {
          lastError = error;
          const backoffMs = RETRY_DELAYS_MS[attempt];
          if (backoffMs === undefined || !isTransientConnectionError(error)) throw error;
          await delay(backoffMs);
        }
      }
      throw lastError;
    },
  },
});

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.mewmoPrisma) {
    const connectionString = process.env.DATABASE_URL ?? "postgresql://mewmo:mewmo@localhost:15432/mewmo_dev?schema=public";
    const adapter = new PrismaPg(connectionString);
    const base = new PrismaClient({
      adapter,
      log: ["error"],
      transactionOptions: { maxWait: 10_000, timeout: 15_000 },
    });
    // The extension only wraps behavior and preserves the full client surface,
    // so casting back to PrismaClient keeps every existing consumer's types intact.
    globalForPrisma.mewmoPrisma = base.$extends(retryExtension) as unknown as PrismaClient;
  }

  return globalForPrisma.mewmoPrisma;
}

export { Prisma, PrismaClient };
