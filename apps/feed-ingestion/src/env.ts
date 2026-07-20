export interface FeedIngestionEnv {
  DATABASE_URL: string;
}

export function loadFeedIngestionEnv(
  input: Record<string, string | undefined> = process.env,
): FeedIngestionEnv {
  const databaseUrl = input.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Invalid Feed Ingestion environment: DATABASE_URL");
  }
  return { DATABASE_URL: databaseUrl };
}
