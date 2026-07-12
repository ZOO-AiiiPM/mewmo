export const FEED_ENTRY_REQUEST_TIMEOUT_MS = 3_000;

interface FeedFirstEntry {
  id: string;
  type: string;
}

interface FeedFirstEntryDeps {
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
}

export async function waitForFirstFeedEntry(feed: FeedFirstEntry, timeoutMs = 15_000, deps: FeedFirstEntryDeps = {}) {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const pollIntervalMs = deps.pollIntervalMs ?? 500;
  const requestTimeoutMs = deps.requestTimeoutMs ?? FEED_ENTRY_REQUEST_TIMEOUT_MS;
  const startedAt = now();

  while (now() - startedAt < timeoutMs) {
    const params = new URLSearchParams({ type: feed.type, feedId: feed.id });
    const remainingMs = timeoutMs - (now() - startedAt);
    const requestLimitMs = Math.min(requestTimeoutMs, remainingMs);
    try {
      const [entriesResponse, feedResponse] = await Promise.all([
        fetchWithTimeout(`/api/feed-entries?${params.toString()}`, requestLimitMs, fetcher),
        fetchWithTimeout(`/api/feeds/${feed.id}`, requestLimitMs, fetcher),
      ]);
      if (entriesResponse.ok) {
        const entries = (await entriesResponse.json()) as unknown[];
        if (entries.length > 0) return true;
      }
      if (feedResponse.ok) {
        const status = (await feedResponse.json()) as { lastFetchStatus?: string };
        if (status.lastFetchStatus === "error" || status.lastFetchStatus === "partial") return false;
      }
    } catch {
      // A transient polling failure is handled by the same bounded timeout.
    }

    const sleepMs = Math.min(pollIntervalMs, timeoutMs - (now() - startedAt));
    if (sleepMs <= 0) break;
    await sleep(sleepMs);
  }

  return false;
}

async function fetchWithTimeout(url: string, timeoutMs: number, fetcher: typeof fetch) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetcher(url, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Feed status request timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
