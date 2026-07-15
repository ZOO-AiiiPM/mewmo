import { describe, expect, it, vi } from "vitest";
import type { LookupFunction } from "node:net";

import { fetchOutbound, UnsafeOutboundUrlError } from "./outbound";

const publicLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

describe("fetchOutbound", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/feed.xml",
    "https://user:password@example.com/private",
    "http://127.0.0.1/admin",
    "http://[::1]/admin",
  ])("rejects unsafe URL %s before fetching", async (url) => {
    const fetchImpl = vi.fn();

    await expect(fetchOutbound(url, {}, { fetchImpl, lookupHost: publicLookup }))
      .rejects.toBeInstanceOf(UnsafeOutboundUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a hostname when DNS resolves to a private address", async () => {
    const fetchImpl = vi.fn();
    const lookupHost = vi.fn().mockResolvedValue([{ address: "10.0.0.8", family: 4 }]);

    await expect(fetchOutbound("https://internal.example/article", {}, { fetchImpl, lookupHost }))
      .rejects.toThrow("blocked address");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects DNS rebinding when the connection lookup changes to a private address", async () => {
    const lookupHost = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const connectLookup: LookupFunction = vi.fn((_hostname, _options, callback) => {
      callback(null, "10.0.0.8", 4);
    });

    await expect(fetchOutbound("https://dns-rebinding.invalid/article", {}, {
      lookupHost,
      connectLookup,
    })).rejects.toThrow("blocked address");
    expect(connectLookup).toHaveBeenCalledTimes(1);
  });

  it("revalidates redirect destinations before following them", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    );

    await expect(fetchOutbound("https://example.com/article", {}, { fetchImpl, lookupHost: publicLookup }))
      .rejects.toThrow("blocked address");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://example.com/article"),
      expect.objectContaining({ redirect: "manual", dispatcher: expect.anything() }),
    );
  });

  it("follows a bounded public redirect and returns the final response", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 301,
        headers: { location: "https://www.example.com/final" },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchOutbound("https://example.com/start", {}, {
      fetchImpl,
      lookupHost: publicLookup,
    });

    expect(await response.text()).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("allows only an explicitly listed private origin for local integration fixtures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("fixture"));

    const response = await fetchOutbound("http://127.0.0.1:3101/article", {}, {
      fetchImpl,
      allowedPrivateOrigins: ["http://127.0.0.1:3101"],
    });

    expect(await response.text()).toBe("fixture");
    await expect(fetchOutbound("http://127.0.0.1:3102/article", {}, {
      fetchImpl,
      allowedPrivateOrigins: ["http://127.0.0.1:3101"],
    })).rejects.toThrow("blocked address");
  });
});
