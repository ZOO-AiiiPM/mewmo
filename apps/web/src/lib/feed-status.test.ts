import { describe, expect, it } from "vitest";

import { getFeedAddToast, getFeedEmptyState, isFeedSyncActive } from "./feed-status";

describe("feed status copy", () => {
  it("explains queued creation and queue submission failures", () => {
    expect(getFeedAddToast({ existing: false, queued: true })).toEqual({
      text: "已添加订阅，正在后台同步",
      type: "success",
    });
    expect(getFeedAddToast({ existing: false, queued: false })).toEqual({
      text: "已添加订阅，后台同步启动失败",
      type: "error",
    });
    expect(getFeedAddToast({ existing: true, queued: false })).toEqual({
      text: "该订阅已经添加过",
      type: "success",
    });
  });

  it("marks only queued and fetching feeds as actively syncing", () => {
    expect(isFeedSyncActive("queued")).toBe(true);
    expect(isFeedSyncActive("fetching")).toBe(true);
    expect(isFeedSyncActive("success")).toBe(false);
    expect(isFeedSyncActive("partial")).toBe(false);
    expect(isFeedSyncActive("error")).toBe(false);
  });

  it("shows active first fetch without offering a duplicate retry", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: { lastFetchedAt: null, lastFetchStatus: "fetching" },
      }),
    ).toEqual({
      title: "正在同步订阅文章",
      detail: "文章会在抓取成功后逐篇出现在这里。",
      canRefresh: false,
    });
  });

  it("shows partial and failed fetch states with retry", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: {
          lastFetchedAt: "2026-07-12T00:00:00.000Z",
          lastFetchStatus: "partial",
          lastFetchError: "one entry timed out",
        },
      }),
    ).toEqual({
      title: "部分文章同步失败",
      detail: "one entry timed out",
      canRefresh: true,
    });
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
