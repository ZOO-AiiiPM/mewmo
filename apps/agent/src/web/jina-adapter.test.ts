import { describe, expect, it, vi } from "vitest";

import { AgentError } from "../errors";
import { assertSafeUrl, createJinaWebAdapter } from "./jina-adapter";

function jsonResponse(body: unknown, { status = 200, url = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null,
  } as unknown as Response;
}

function textResponse(text: string, { status = 200, url = "https://example.com/a", contentType = "text/plain" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers({ "content-type": contentType }),
    text: async () => text,
    body: null,
  } as unknown as Response;
}

function abortError() {
  return Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
}

describe("assertSafeUrl SSRF protection", () => {
  it("accepts a plain public https URL", () => {
    expect(assertSafeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
  });

  it.each([
    ["ftp://example.com/x", "non-http scheme"],
    ["http://user:pass@example.com", "embedded credentials"],
    ["http://localhost/x", "localhost"],
    ["http://service.localhost/x", "dot-localhost"],
    ["http://127.0.0.1/x", "loopback"],
    ["http://10.1.2.3/x", "10.0.0.0/8 private"],
    ["http://192.168.0.5/x", "192.168 private"],
    ["http://172.16.0.1/x", "172.16 private"],
    ["http://169.254.169.254/latest/meta-data", "link-local metadata"],
    ["http://100.64.0.1/x", "CGNAT"],
    ["http://0.0.0.0/x", "this-network"],
    ["http://[::1]/x", "IPv6 loopback"],
    ["http://[fd00::1]/x", "IPv6 ULA"],
    ["http://[::ffff:127.0.0.1]/x", "IPv4-mapped IPv6 loopback"],
    ["not a url", "malformed"],
  ])("rejects %s (%s)", (raw) => {
    expect(() => assertSafeUrl(raw)).toThrow(AgentError);
  });
});

describe("Jina web adapter search", () => {
  it("maps and caps provider results and dedupes URLs", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { title: "First", url: "https://a.example/1", description: "one" },
          { title: "Dup", url: "https://a.example/1", description: "dup" },
          { title: "Second", url: "https://b.example/2" },
          { title: "Third", url: "https://c.example/3" },
        ],
      }),
    );
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    const out = await adapter.search({ query: "hello", limit: 2 });
    expect(out.results).toEqual([
      { title: "First", url: "https://a.example/1", snippet: "one" },
      { title: "Second", url: "https://b.example/2" },
    ]);
  });

  it("rejects an empty query without calling the provider", async () => {
    const fetchImpl = vi.fn();
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.search({ query: "   ", limit: 5 })).rejects.toMatchObject({ code: "bad_request" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("serves a repeated search from cache within the TTL", async () => {
    let clock = 1_000;
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ title: "T", url: "https://a.example/1" }] }));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl, cacheTtlMs: 5_000, now: () => clock });
    await adapter.search({ query: "q", limit: 5 });
    clock += 1_000;
    await adapter.search({ query: "q", limit: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 5_000;
    await adapter.search({ query: "q", limit: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps a 401 to a non-retryable unauthorized error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 401 }));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.search({ query: "q", limit: 5 })).rejects.toMatchObject({ code: "unauthorized", retryable: false });
  });

  it("maps a 429 to a rate_limited error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 429 }));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.search({ query: "q", limit: 5 })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("maps a 500 to dependency_unavailable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 503 }));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.search({ query: "q", limit: 5 })).rejects.toMatchObject({ code: "dependency_unavailable" });
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw abortError();
    });
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.search({ query: "q", limit: 5 })).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("Jina web adapter fetch", () => {
  it("returns cleaned content and truncates to maxChars", async () => {
    const fetchImpl = vi.fn(async () => textResponse("abcdefghij"));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    const out = await adapter.fetch({ url: "https://example.com/a", maxChars: 4 });
    expect(out.content).toBe("abcd");
    expect(out.truncated).toBe(true);
    expect(out.finalUrl).toBe("https://example.com/a");
  });

  it("parses a JSON reader payload with title", async () => {
    const fetchImpl = vi.fn(async () => textResponse(JSON.stringify({ data: { title: "Page", content: "body text" } })));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    const out = await adapter.fetch({ url: "https://example.com/a", maxChars: 100 });
    expect(out).toMatchObject({ title: "Page", content: "body text", truncated: false });
  });

  it("rejects a fetch before dialing when the URL is internal", async () => {
    const fetchImpl = vi.fn();
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.fetch({ url: "http://169.254.169.254/latest", maxChars: 100 })).rejects.toMatchObject({ code: "bad_request" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects when the reader reports a redirect to an internal target", async () => {
    const fetchImpl = vi.fn(async () => textResponse(JSON.stringify({ data: { content: "secret", url: "http://127.0.0.1/secret" } })));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.fetch({ url: "https://example.com/a", maxChars: 100 })).rejects.toMatchObject({ code: "bad_request" });
  });

  it("reports the payload source URL as finalUrl, not the reader proxy URL", async () => {
    const fetchImpl = vi.fn(async () => textResponse(JSON.stringify({ data: { title: "T", content: "body", url: "https://real.example/page" } }), { url: "https://r.jina.ai/https://real.example/page" }));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    const out = await adapter.fetch({ url: "https://real.example/page", maxChars: 100 });
    expect(out.finalUrl).toBe("https://real.example/page");
  });

  it("serves a repeated fetch from cache within the TTL", async () => {
    const fetchImpl = vi.fn(async () => textResponse("hello"));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl, cacheTtlMs: 60_000 });
    await adapter.fetch({ url: "https://example.com/a", maxChars: 100 });
    await adapter.fetch({ url: "https://example.com/a", maxChars: 100 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a 404 to a non-retryable not_found error", async () => {
    const fetchImpl = vi.fn(async () => textResponse("", { status: 404 }));
    const adapter = createJinaWebAdapter({ apiKey: "k", fetchImpl });
    await expect(adapter.fetch({ url: "https://example.com/a", maxChars: 100 })).rejects.toMatchObject({ code: "not_found", retryable: false });
  });
});
