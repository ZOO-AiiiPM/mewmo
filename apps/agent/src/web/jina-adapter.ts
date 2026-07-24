import { AgentError } from "../errors";
import type { WebFetchOutput, WebPort, WebSearchHit, WebSearchOutput } from "./port";

export interface JinaWebAdapterOptions {
  apiKey: string;
  /** Total request timeout in milliseconds. */
  timeoutMs?: number;
  /** Cache time-to-live in milliseconds. 0 disables caching. */
  cacheTtlMs?: number;
  /** Maximum number of cached entries. */
  cacheMaxEntries?: number;
  /** Injectable fetch implementation (tests). */
  fetchImpl?: typeof fetch;
  /** Injectable clock returning epoch ms (tests). */
  now?: () => number;
}

const SEARCH_ENDPOINT = "https://s.jina.ai/";
const READER_ENDPOINT = "https://r.jina.ai/";
const USER_AGENT = "mewmo-agent/1.0 (+https://mewmo.ai)";
/** Hard cap on downloaded bytes before text truncation, to bound memory. */
const MAX_RESPONSE_BYTES = 2_000_000;

export function createJinaWebAdapter(options: JinaWebAdapterOptions): WebPort {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = new TtlCache(options.cacheTtlMs ?? 300_000, options.cacheMaxEntries ?? 128, options.now ?? (() => Date.now()));

  return {
    async search({ query, limit }) {
      const trimmed = query.trim();
      if (!trimmed) throw new AgentError("bad_request", "web_search query must not be empty.");
      const cacheKey = `search:${trimmed}:${limit}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached as WebSearchOutput;
      const data = await requestJson(
        SEARCH_ENDPOINT,
        { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ q: trimmed, num: limit }) },
        options.apiKey,
        timeoutMs,
        fetchImpl,
      );
      const output: WebSearchOutput = { results: mapSearchResults(data, limit) };
      cache.set(cacheKey, output);
      return output;
    },

    async fetch({ url, maxChars }) {
      const requestedUrl = assertSafeUrl(url);
      const cacheKey = `fetch:${requestedUrl}:${maxChars}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached as WebFetchOutput;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(READER_ENDPOINT + requestedUrl, {
          method: "GET",
          // JSON gives a structured title + cleaned markdown content, which
          // web_fetch needs to emit a titled citation.
          headers: { Accept: "application/json", "User-Agent": USER_AGENT, Authorization: `Bearer ${options.apiKey}` },
          redirect: "follow",
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof AgentError) throw error;
        throw mapNetworkError(error);
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw mapHttpError(response.status);
      const contentType = response.headers.get("content-type") ?? undefined;
      const { text, byteCapped } = await readBodyCapped(response, MAX_RESPONSE_BYTES);
      const parsed = parseReaderPayload(text);
      if (!parsed.content) throw new AgentError("dependency_unavailable", "The web page returned no readable text content.");
      // The response always comes from the reader proxy; the true source URL
      // (after any server-side redirects) is reported in the payload. Re-check
      // it so a redirect to an internal target is rejected.
      const finalUrl = assertSafeUrl(parsed.url ?? requestedUrl);
      const content = parsed.content.slice(0, maxChars);
      const output: WebFetchOutput = {
        requestedUrl,
        finalUrl,
        ...(parsed.title ? { title: parsed.title } : {}),
        content,
        truncated: byteCapped || parsed.content.length > maxChars,
        ...(contentType ? { contentType } : {}),
      };
      cache.set(cacheKey, output);
      return output;
    },
  };
}

async function requestJson(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${apiKey}`, "User-Agent": USER_AGENT },
      redirect: "error",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw mapNetworkError(error);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw mapHttpError(response.status);
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new AgentError("dependency_unavailable", "The web search provider returned an invalid response.", { cause: error });
  }
}

function mapSearchResults(data: unknown, limit: number): WebSearchHit[] {
  const list = isRecord(data) && Array.isArray(data.data) ? data.data : [];
  const seen = new Set<string>();
  const results: WebSearchHit[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.url !== "string") continue;
    const url = item.url.trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    results.push({
      title: typeof item.title === "string" && item.title ? item.title : url,
      url,
      ...(typeof item.description === "string" && item.description ? { snippet: item.description } : {}),
      ...(typeof item.publishedAt === "string" && item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      ...(isRecord(item.source) && typeof item.source.name === "string" ? { source: item.source.name } : typeof item.siteName === "string" && item.siteName ? { source: item.siteName } : {}),
    });
    if (results.length >= limit) break;
  }
  return results;
}

function parseReaderPayload(text: string): { title?: string; url?: string; content: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      if (isRecord(data)) {
        const payload = isRecord(data.data) ? data.data : data;
        const content = typeof payload.content === "string" ? payload.content : typeof payload.text === "string" ? payload.text : "";
        return {
          ...(typeof payload.title === "string" && payload.title ? { title: payload.title } : {}),
          ...(typeof payload.url === "string" && payload.url ? { url: payload.url } : {}),
          content: content.trim(),
        };
      }
    } catch {
      // Fall through and treat the whole body as plain text.
    }
  }
  return { content: trimmed };
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<{ text: string; byteCapped: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return { text, byteCapped: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let capped = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      capped = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.byteLength > merged.byteLength) {
      merged.set(chunk.subarray(0, merged.byteLength - offset), offset);
      break;
    }
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8").decode(merged), byteCapped: capped };
}

/**
 * Validates that a URL is a plain public http(s) target. Rejects credentials,
 * non-http(s) schemes, localhost, loopback, link-local, private ranges and the
 * cloud metadata endpoint. Throws a stable bad_request error otherwise.
 */
export function assertSafeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AgentError("bad_request", "The provided URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AgentError("bad_request", "Only http and https URLs are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new AgentError("bad_request", "URLs containing credentials are not allowed.");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isBlockedHost(host)) throw new AgentError("bad_request", "Access to internal or reserved network addresses is not allowed.");
  return parsed.toString();
}

function isBlockedHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.includes(":")) return isBlockedIpv6(host);
  const parts = host.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const octets = parts.map((part) => Number(part));
    if (octets.some((octet) => octet > 255)) return true;
    const a = octets[0] ?? 0;
    const b = octets[1] ?? 0;
    if (a === 0) return true; // 0.0.0.0/8 "this" network
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const normalized = host.split("%")[0] ?? host;
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d). URL normalization may fold the trailing
  // IPv4 octets into hex groups, so block the mapped range outright.
  if (normalized.startsWith("::ffff:")) return true;
  return false;
}

function mapHttpError(status: number): AgentError {
  if (status === 401 || status === 403) return new AgentError("unauthorized", "The web provider rejected the configured API key.", { retryable: false });
  if (status === 404) return new AgentError("not_found", "The requested web resource was not found.", { retryable: false });
  if (status === 429) return new AgentError("rate_limited", "The web provider is rate limited.");
  if (status >= 500) return new AgentError("dependency_unavailable", "The web provider is currently unavailable.");
  return new AgentError("dependency_unavailable", `The web provider returned status ${status}.`, { retryable: false });
}

function mapNetworkError(error: unknown): AgentError {
  if (error instanceof Error && (error.name === "AbortError" || /timeout|aborted/i.test(error.message))) {
    return new AgentError("timeout", "The web request timed out.");
  }
  return new AgentError("dependency_unavailable", "The web provider could not be reached.", { cause: error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class TtlCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  get(key: string): unknown | undefined {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency for LRU eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: unknown): void {
    if (this.ttlMs <= 0 || this.maxEntries <= 0) return;
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
