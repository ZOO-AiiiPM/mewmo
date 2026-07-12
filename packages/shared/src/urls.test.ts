import { describe, expect, it } from "vitest";

import { normalizeClipUrlIdentity } from "./urls";

describe("normalizeClipUrlIdentity", () => {
  it("treats protocol, host case, default ports, fragments, and trailing slash as equivalent", () => {
    expect(normalizeClipUrlIdentity("HTTP://Example.COM:80/article/#section")).toBe(
      normalizeClipUrlIdentity("https://example.com/article"),
    );
  });

  it("removes common tracking parameters and sorts meaningful parameters", () => {
    expect(
      normalizeClipUrlIdentity("https://example.com/read?utm_source=x&b=2&a=1&fbclid=abc"),
    ).toBe("example.com/read?a=1&b=2");
  });

  it("preserves non-default ports and meaningful path case", () => {
    expect(normalizeClipUrlIdentity("http://example.com:8080/Article"))
      .toBe("example.com:8080/Article");
  });
});
