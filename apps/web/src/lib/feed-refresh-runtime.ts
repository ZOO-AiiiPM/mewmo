import { refreshDueFeeds } from "./feed-refresh-service";

const DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS = 60_000;

type FeedRefreshSchedulerState = {
  intervalTimer: NodeJS.Timeout;
  running: boolean;
};

const globalForFeedRefresh = globalThis as typeof globalThis & {
  mewmoFeedRefreshScheduler?: FeedRefreshSchedulerState;
};

async function runWebFeedRefreshOnce(state: FeedRefreshSchedulerState) {
  if (state.running) return;
  state.running = true;
  try {
    const result = await refreshDueFeeds();
    if ((result.checked ?? 0) > 0 || (result.created ?? 0) > 0) {
      console.log(
        `feed refresh checked ${result.checked ?? 0} source(s), fetched ${result.fetched ?? 0} item(s), created ${result.created ?? 0} item(s)`,
      );
    }
  } catch (error) {
    console.error("feed refresh check failed", error);
  } finally {
    state.running = false;
  }
}

export function startWebFeedRefreshScheduler() {
  const schedulerMode = process.env.FEED_REFRESH_SCHEDULER;
  if (schedulerMode !== "on") return;
  if (globalForFeedRefresh.mewmoFeedRefreshScheduler) return;

  const state: FeedRefreshSchedulerState = {
    intervalTimer: setInterval(() => {
      void runWebFeedRefreshOnce(state);
    }, DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS),
    running: false,
  };
  state.intervalTimer.unref?.();
  globalForFeedRefresh.mewmoFeedRefreshScheduler = state;

  void runWebFeedRefreshOnce(state);
}
