export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxy) {
      const { setGlobalDispatcher, ProxyAgent } = await import("undici");
      setGlobalDispatcher(new ProxyAgent(proxy));
    }
  }
}
