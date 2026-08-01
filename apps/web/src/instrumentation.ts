export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxy) {
      // EnvHttpProxyAgent respects NO_PROXY, so local loopback services
      // (e.g. the agent on 127.0.0.1) keep bypassing the proxy.
      const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
      setGlobalDispatcher(new EnvHttpProxyAgent());
    }
  }
}
