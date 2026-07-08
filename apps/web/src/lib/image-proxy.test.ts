import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { proxiedImageUrl } from "./image-proxy";

describe("proxiedImageUrl", () => {
  it("routes remote images through the app proxy", () => {
    expect(proxiedImageUrl("https://rssfile.sspai.com/a.png?x=1")).toBe(
      "/api/image-proxy?url=https%3A%2F%2Frssfile.sspai.com%2Fa.png%3Fx%3D1",
    );
  });

  it("keeps local and embedded image sources unchanged", () => {
    expect(proxiedImageUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    expect(proxiedImageUrl("blob:https://example.com/abc")).toBe(
      "blob:https://example.com/abc",
    );
    expect(proxiedImageUrl("asset:local-image")).toBe("asset:local-image");
  });

  it("allows common WeChat animated images through the proxy size cap", () => {
    const route = readFileSync("src/app/api/image-proxy/route.ts", "utf8");

    expect(route).toContain("const MAX_IMAGE_BYTES = 20 * 1024 * 1024");
  });
});
