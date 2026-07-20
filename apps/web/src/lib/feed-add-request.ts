export const DEFAULT_FEED_ADD_REQUEST_TIMEOUT_MS = 45_000;

interface FeedAddRequestDependencies {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function submitFeedAddRequest<TResponse>(
  body: unknown,
  dependencies: FeedAddRequestDependencies = {},
): Promise<TResponse> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/feeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(dependencies.timeoutMs ?? DEFAULT_FEED_ADD_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error("Feed add request failed");
  return (await response.json()) as TResponse;
}
