import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS,
  runFeedRefreshOnce,
  startFeedRefreshScheduler,
} from "./feed-refresh-scheduler";

describe("feed refresh scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls the cron refresh endpoint with the configured secret", async () => {
    const fetchCron = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checked: 2, fetched: 10, created: 3 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await runFeedRefreshOnce({
      fetchCron,
      env: {
        NEXTAUTH_URL: "http://localhost:3000",
        FEED_CRON_SECRET: "secret-1",
      },
    });

    expect(fetchCron).toHaveBeenCalledWith("http://localhost:3000/api/feeds/cron-refresh", {
      method: "POST",
      headers: { authorization: "Bearer secret-1" },
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({ checked: 2, fetched: 10, created: 3 });
  });

  it("checks immediately and then polls for due feeds", async () => {
    const fetchCron = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checked: 0, fetched: 0, created: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const scheduler = startFeedRefreshScheduler({
      fetchCron,
      env: { NEXTAUTH_URL: "http://localhost:3000" },
      intervalMs: DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS,
      logger: { error: vi.fn(), log: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCron).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS);
    expect(fetchCron).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });
});
