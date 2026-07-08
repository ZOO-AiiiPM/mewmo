import { describe, expect, it } from "vitest";

import { getFeedAddToast, getFeedEmptyState } from "./feed-status";

describe("feed status copy", () => {
  it("summarizes the initial fetch result after feed creation", () => {
    expect(getFeedAddToast({ initialFetch: { status: "ok", fetched: 10, created: 7 } })).toEqual({
      text: "已添加订阅，抓取 7 篇新文章",
      type: "success",
    });
    expect(getFeedAddToast({ initialFetch: { status: "error", fetched: 0, created: 0 } })).toEqual({
      text: "已添加订阅，首次抓取失败",
      type: "error",
    });
  });

  it("explains that a new feed is waiting for its first fetch", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: { lastFetchedAt: null },
      }),
    ).toEqual({
      title: "正在等待首次抓取",
      detail: "首次抓取完成后，条目会自动出现在这里。",
      canRefresh: true,
    });
  });

  it("shows a failed first fetch instead of a waiting state", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: {
          lastFetchedAt: null,
          lastFetchStatus: "error",
          lastFetchError: "timeout",
        },
      }),
    ).toEqual({
      title: "首次抓取失败",
      detail: "timeout",
      canRefresh: true,
    });
  });
});
