import { setGlobalDispatcher, ProxyAgent } from "undici";

export async function register() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy) {
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
}
