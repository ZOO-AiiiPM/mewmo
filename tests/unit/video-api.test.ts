import { describe, expect, it } from "vitest";

import { mapVideoDetail, mapVideoListItem, mapVideoSource } from "../../apps/web/src/lib/video-api";

describe("video API mapping", () => {
  it("maps feeds and compact entries without inventing watch progress", () => {
    expect(mapVideoSource({
      id: "feed-1",
      title: "哔哩哔哩视频",
      url: "https://www.bilibili.com",
      unreadCount: 2,
      lastFetchedAt: null,
    })).toMatchObject({ id: "feed-1", platform: "bilibili", unreadCount: 2 });

    expect(mapVideoListItem({
      id: "entry-1",
      feedId: "feed-1",
      title: "AI 长期记忆",
      url: "https://www.bilibili.com/video/BV1mock001",
      content: "原视频简介",
      excerpt: "列表预览",
      sourceName: "Mewmo Lab",
      readAt: null,
      isFavorited: false,
      tags: [{ name: "AI", color: "#7c3aed" }],
      videoDetail: {
        platform: "bilibili",
        durationSeconds: 125,
        processingStatus: "analyzing",
        sourceTags: ["人工智能"],
      },
    })).toMatchObject({
      id: "entry-1",
      durationSeconds: 125,
      processingStatus: "analyzing",
      mewmoTags: ["AI"],
      mewmoTagColors: { AI: "#7c3aed" },
      progressSeconds: 0,
      watchStatus: "unwatched",
      mockVideoUrl: null,
    });
  });

  it("normalizes structured video detail JSON and user highlights", () => {
    const detail = mapVideoDetail({
      id: "entry-1",
      feedId: "feed-1",
      title: "AI 长期记忆",
      url: "https://www.bilibili.com/video/BV1mock001",
      content: "原视频简介",
      sourceName: "Mewmo Lab",
      readAt: "2026-07-19T00:00:00.000Z",
      tags: [],
      videoDetail: {
        platform: "bilibili",
        processingStatus: "ready",
        quickJudgment: {
          summary: "核心摘要",
          highlights: ["亮点"],
          thoughts: ["思考"],
          terms: [{ term: "长期记忆", explanation: "跨会话保留的信息" }],
        },
        keyPoints: ["关键点"],
        targetAudience: "产品经理",
        chapters: [{ startSeconds: 0, endSeconds: 30, title: "开场", theme: "背景", summary: "章节摘要" }],
        transcript: [{ startSeconds: 0, endSeconds: 8, text: "字幕正文" }],
        aiHighlights: [{ startSeconds: 4, title: "高光", note: "值得记录", score: 90 }],
        suggestedTags: ["知识管理"],
        userHighlights: [{ id: "highlight-1", text: "用户高光", startSeconds: 4, createdAt: "2026-07-19T00:00:00.000Z" }],
      },
    });

    expect(detail).toMatchObject({
      processingStatus: "ready",
      quickJudgment: { summary: "核心摘要" },
      keyPoints: ["关键点"],
      targetAudience: "产品经理",
      suggestedTags: ["知识管理"],
    });
    expect(detail?.chapters[0]?.id).toContain("entry-1-chapter");
    expect(detail?.transcript[0]?.text).toBe("字幕正文");
    expect(detail?.highlights[0]?.score).toBe(90);
    expect(detail?.userHighlights?.[0]?.id).toBe("highlight-1");
  });
});
