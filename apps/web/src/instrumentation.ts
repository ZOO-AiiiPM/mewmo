export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxy) {
      const { setGlobalDispatcher, ProxyAgent } = await import("undici");
      setGlobalDispatcher(new ProxyAgent(proxy));
    }

    const { startWebFeedRefreshScheduler } = await import("./lib/feed-refresh-runtime");
    startWebFeedRefreshScheduler();
  }
}
