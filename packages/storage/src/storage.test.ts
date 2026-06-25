import { describe, expect, it, vi } from "vitest";

import { createStorageService } from "./storage";

const env = {
  R2_BUCKET: "mewmo-dev",
  R2_PUBLIC_BASE_URL: "https://cdn.mewmo.test",
};

describe("storage", () => {
  it("returns public urls for stored paths", () => {
    const storage = createStorageService({ send: vi.fn() }, env);

    expect(storage.getUrl("images/cat.png")).toBe("https://cdn.mewmo.test/images/cat.png");
  });

  it("uploads objects to the configured bucket", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = createStorageService({ send }, env);

    await storage.upload(new Uint8Array([1, 2, 3]), "images/cat.png", "image/png");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: "mewmo-dev",
      Key: "images/cat.png",
      ContentType: "image/png",
    });
  });
});
