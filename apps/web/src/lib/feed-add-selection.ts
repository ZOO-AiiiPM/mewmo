export type FeedAddOutcomeStatus = "added" | "existing" | "failed";

interface FeedAddResult {
  existing?: boolean;
  queued?: boolean;
  backgroundStarted?: boolean;
}

export function feedAddOutcome(feed: FeedAddResult): FeedAddOutcomeStatus {
  if (feed.queued === false && feed.backgroundStarted) return "failed";
  return feed.existing ? "existing" : "added";
}

export function toggleFeedUrl(selected: string[], url: string) {
  return selected.includes(url)
    ? selected.filter((item) => item !== url)
    : [...selected, url];
}

export function selectAllFeedUrls(candidates: Array<{ url: string }>) {
  return [...new Set(candidates.map((candidate) => candidate.url))];
}

export function failedFeedUrls(outcomes: Record<string, FeedAddOutcomeStatus>) {
  return Object.entries(outcomes)
    .filter(([, status]) => status === "failed")
    .map(([url]) => url);
}
