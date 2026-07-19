import { describe, expect, it } from "vitest";

import { normalizeRedisUrl } from "./client";

describe("normalizeRedisUrl", () => {
  it("upgrades Upstash connections to TLS", () => {
    expect(normalizeRedisUrl("redis://default:secret@example.upstash.io:6379")).toBe(
      "rediss://default:secret@example.upstash.io:6379",
    );
  });

  it("keeps local Redis connections unchanged", () => {
    expect(normalizeRedisUrl("redis://localhost:6379")).toBe("redis://localhost:6379");
  });
});
