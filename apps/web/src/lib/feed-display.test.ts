import { describe, expect, it } from "vitest";

import {
  buildFeedCardMeta,
  buildFeedReaderMeta,
  preferredFeedCardSource,
  preferredFeedReaderSource,
} from "./feed-display";

const entry = {
  author: "CG艺术实验室",
  sourceName: "少数派 - 高品质数字消费指南",
  url: "https://www.sspai.com/post/1",
  publishedAt: "2026-06-30T10:20:00.000Z",
  createdAt: "2026-06-30T10:30:00.000Z",
  feedId: "feed-1",
  feed: { title: "少数派" },
};

describe("feed display metadata", () => {
  it("uses the subscription title for feed card source labels", () => {
    expect(preferredFeedCardSource(entry)).toBe("少数派");
    expect(buildFeedCardMeta(entry)).toEqual([
      "CG艺术实验室",
      "少数派",
      "2026-06-30T10:20:00.000Z",
    ]);
  });

  it("uses clip-style source labels for feed reader metadata", () => {
    expect(preferredFeedReaderSource(entry)).toBe("少数派 - 高品质数字消费指南");
    expect(preferredFeedReaderSource({ ...entry, sourceName: null })).toBe("sspai.com");
  });

  it("omits the repeated subscription source when a source is selected", () => {
    expect(buildFeedCardMeta(entry, "feed-1")).toEqual([
      "CG艺术实验室",
      "2026-06-30T10:20:00.000Z",
    ]);
  });

  it("orders reader metadata as author, source, time, then reading stats without tags", () => {
    expect(
      buildFeedReaderMeta({
        entry,
        selectedFeedId: "feed-1",
        words: 1260,
        minutes: 5,
      }),
    ).toEqual([
      "CG艺术实验室",
      "少数派 - 高品质数字消费指南",
      "2026-06-30T10:20:00.000Z",
      "1260 字",
      "预计 5 分钟",
    ]);
  });
});
