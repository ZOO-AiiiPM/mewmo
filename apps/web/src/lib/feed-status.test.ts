import { describe, expect, it } from "vitest";

import { getFeedAddToast, getFeedEmptyState, isFeedSyncActive } from "./feed-status";

describe("feed status copy", () => {
  it("explains immediate initial fetch results without exposing queue details", () => {
    expect(getFeedAddToast({ existing: false, initialFetch: { status: "success", fetched: 5, requested: 5 } })).toEqual({
      text: "已导入 5 篇，后台正在补全正文与 AI 总结",
      type: "success",
    });
    expect(getFeedAddToast({ existing: false, initialFetch: { status: "success", fetched: 3, requested: 5 } })).toEqual({
      text: "已导入 3 篇（源当前仅提供 3 篇），后台正在补全正文与 AI 总结",
      type: "success",
    });
    expect(getFeedAddToast({ existing: false, initialFetch: { status: "error" } })).toEqual({
      text: "订阅已保存，后台会自动重试",
      type: "error",
    });
    expect(getFeedAddToast({ existing: true })).toEqual({
      text: "该订阅已经添加过",
      type: "success",
    });
  });

  it("marks only queued and fetching feeds as actively syncing", () => {
    const now = new Date("2026-07-12T00:00:30.000Z");
    expect(isFeedSyncActive("queued", "2026-07-12T00:00:00.000Z", now)).toBe(true);
    expect(isFeedSyncActive("fetching", "2026-07-12T00:00:00.000Z", now)).toBe(true);
    expect(isFeedSyncActive("queued", null, now)).toBe(false);
    expect(isFeedSyncActive("fetching", null, now)).toBe(false);
    expect(isFeedSyncActive("success")).toBe(false);
    expect(isFeedSyncActive("partial")).toBe(false);
    expect(isFeedSyncActive("error")).toBe(false);
    expect(isFeedSyncActive("queued", "2026-07-12T00:00:00.000Z", new Date("2026-07-12T00:02:00.000Z"))).toBe(false);
    expect(isFeedSyncActive("fetching", "2026-07-12T00:00:00.000Z", new Date("2026-07-12T00:02:00.000Z"))).toBe(false);
  });

  it("turns stale fetching into a recoverable timeout state", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: {
          lastFetchedAt: null,
          lastFetchStatus: "fetching",
          lastFetchStartedAt: "2026-07-12T00:00:00.000Z",
        },
        now: new Date("2026-07-12T00:02:00.000Z"),
      }),
    ).toEqual({
      title: "订阅同步超时",
      detail: "后台抓取没有按时完成，可以重新检查更新。",
      canRefresh: true,
    });
  });

  it("shows active first fetch without offering a duplicate retry", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: {
          lastFetchedAt: null,
          lastFetchStatus: "fetching",
          lastFetchStartedAt: "2026-07-12T00:00:00.000Z",
        },
        now: new Date("2026-07-12T00:00:30.000Z"),
      }),
    ).toEqual({
      title: "正在同步订阅文章",
      detail: "文章会在抓取成功后逐篇出现在这里。",
      canRefresh: false,
    });
  });

  it("turns queued feeds without a usable timestamp into a recoverable timeout state", () => {
    expect(
      getFeedEmptyState({
        feedId: "feed-1",
        selectedFeed: { lastFetchedAt: null, lastFetchStatus: "queued", lastFetchStartedAt: null },
      }),
    ).toEqual({
      title: "订阅同步超时",
      detail: "后台抓取没有按时完成，可以重新检查更新。",
      canRefresh: true,
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
