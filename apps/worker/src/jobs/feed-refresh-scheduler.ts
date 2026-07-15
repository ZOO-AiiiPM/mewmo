export const DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_FEED_REFRESH_TIMEOUT_MS = 30_000;

interface FeedRefreshEnv {
  NEXTAUTH_URL?: string;
  FEED_REFRESH_BASE_URL?: string;
  FEED_CRON_SECRET?: string;
}

interface FeedRefreshLogger {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

interface RunFeedRefreshOptions {
  fetchCron?: typeof fetch;
  env?: FeedRefreshEnv;
  timeoutMs?: number;
}

interface StartFeedRefreshOptions extends RunFeedRefreshOptions {
  intervalMs?: number;
  logger?: FeedRefreshLogger;
}

export interface FeedRefreshCronResult {
  checked: number;
  queued: number;
}

export interface FeedRefreshScheduler {
  stop(): void;
}

function feedRefreshEndpoint(env: FeedRefreshEnv = process.env): string {
  const baseUrl = env.FEED_REFRESH_BASE_URL ?? env.NEXTAUTH_URL ?? "http://localhost:3000";
  return new URL("/api/feeds/cron-refresh", baseUrl).toString();
}

export async function runFeedRefreshOnce(options: RunFeedRefreshOptions = {}): Promise<FeedRefreshCronResult> {
  const env = options.env ?? process.env;
  const fetchCron = options.fetchCron ?? fetch;
  const response = await fetchCron(feedRefreshEndpoint(env), {
    method: "POST",
    headers: env.FEED_CRON_SECRET ? { authorization: `Bearer ${env.FEED_CRON_SECRET}` } : {},
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_FEED_REFRESH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Feed cron refresh failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<FeedRefreshCronResult>;
}

export function startFeedRefreshScheduler(options: StartFeedRefreshOptions = {}): FeedRefreshScheduler {
  const intervalMs = options.intervalMs ?? DEFAULT_FEED_REFRESH_CHECK_INTERVAL_MS;
  const logger = options.logger ?? console;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const result = await runFeedRefreshOnce(options);
      if (result.checked > 0 || result.queued > 0) {
        logger.log(`feed refresh checked ${result.checked} source(s), queued ${result.queued} job(s)`);
      }
    } catch (error) {
      logger.error("feed refresh check failed", error);
    } finally {
      running = false;
    }
  }

  const immediateTimer = setTimeout(() => {
    void tick();
  }, 0);
  const intervalTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  immediateTimer.unref?.();
  intervalTimer.unref?.();

  return {
    stop() {
      clearTimeout(immediateTimer);
      clearInterval(intervalTimer);
    },
  };
}
