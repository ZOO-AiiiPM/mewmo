export function integrationFixtureOrigins(): string[] | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const fixtureUrl = process.env.API_TEST_ARTICLE_URL;
  if (!fixtureUrl) return undefined;

  try {
    return [new URL(fixtureUrl).origin];
  } catch {
    return undefined;
  }
}
