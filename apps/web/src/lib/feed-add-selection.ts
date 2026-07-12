export type FeedAddOutcomeStatus = "added" | "existing" | "failed";

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
