// Wire Node's global fetch (undici) to an HTTP(S) proxy when one is configured.
// Node 22+ ignores http_proxy/https_proxy by default, which breaks outbound
// provider calls (e.g. Gemini) in proxied local environments. Mirrors the
// precedent in apps/web/src/instrumentation.ts. No-op when no proxy is set,
// so production deployments are unaffected.
const proxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

if (proxy) {
  // EnvHttpProxyAgent reads HTTP_PROXY/HTTPS_PROXY/NO_PROXY itself, so
  // loopback targets listed in NO_PROXY keep bypassing the proxy.
  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
