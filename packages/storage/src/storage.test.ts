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

  it("uploads objects to Qiniu when configured", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const storage = createStorageService(
      { send: vi.fn() },
      {
        ...env,
        STORAGE_PROVIDER: "qiniu",
        QINIU_ACCESS_KEY: "access",
        QINIU_SECRET_KEY: "secret",
        QINIU_BUCKET: "mewmo-images",
        QINIU_PUBLIC_BASE_URL: "http://cdn.example.test",
        QINIU_UPLOAD_ENDPOINT: "https://upload-z2.qiniup.com",
      },
      { fetch },
    );

    const result = await storage.upload(new Uint8Array([1, 2, 3]), "images/cat.png", "image/png");

    expect(result).toEqual({
      path: "images/cat.png",
      url: "http://cdn.example.test/images/cat.png",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://upload-z2.qiniup.com");

    const body = fetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("key")).toBe("images/cat.png");
    const token = String(body.get("token"));
    const [accessKey, signature, encodedPolicy] = token.split(":");
    expect(accessKey).toBe("access");
    expect(signature).toBeTruthy();

    const policy = JSON.parse(
      Buffer.from(encodedPolicy!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { scope: string };
    expect(policy.scope).toBe("mewmo-images:images/cat.png");
  });

  it("does not initialize R2 when uploading to Qiniu", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const storage = createStorageService(
      undefined,
      {
        STORAGE_PROVIDER: "qiniu",
        QINIU_ACCESS_KEY: "access",
        QINIU_SECRET_KEY: "secret",
        QINIU_BUCKET: "mewmo-images",
        QINIU_PUBLIC_BASE_URL: "http://cdn.example.test",
        QINIU_UPLOAD_ENDPOINT: "https://upload-z2.qiniup.com",
      },
      { fetch },
    );

    await expect(storage.upload(new Uint8Array([1]), "images/cat.png", "image/png")).resolves.toMatchObject({
      url: "http://cdn.example.test/images/cat.png",
    });
  });
});
