import { failedFeedUrls, feedAddOutcome, type FeedAddOutcomeStatus, type FeedAddResult } from "./feed-add-selection";

export interface FeedAddBatchCandidate {
  url: string;
}

export interface FeedAddBatchResult<TFeed extends FeedAddBatchCandidate> {
  persistedFeeds: TFeed[];
  savedFeeds: TFeed[];
  outcomes: Record<string, FeedAddOutcomeStatus>;
  failedUrls: string[];
}

export async function submitFeedAddBatch<TCandidate extends FeedAddBatchCandidate, TFeed extends FeedAddBatchCandidate & FeedAddResult>(
  candidates: TCandidate[],
  submit: (candidate: TCandidate) => Promise<TFeed>,
): Promise<FeedAddBatchResult<TFeed>> {
  const settled = await Promise.allSettled(candidates.map((candidate) => submit(candidate)));
  const outcomes: Record<string, FeedAddOutcomeStatus> = {};
  const persistedFeeds: TFeed[] = [];
  const savedFeeds: TFeed[] = [];
  settled.forEach((result, index) => {
    const candidate = candidates[index]!;
    if (result.status === "fulfilled") {
      persistedFeeds.push(result.value);
      const outcome = feedAddOutcome(result.value);
      outcomes[candidate.url] = outcome;
      if (outcome !== "failed") savedFeeds.push(result.value);
    } else {
      outcomes[candidate.url] = "failed";
    }
  });
  return {
    persistedFeeds,
    savedFeeds,
    outcomes,
    failedUrls: failedFeedUrls(outcomes),
  };
}
