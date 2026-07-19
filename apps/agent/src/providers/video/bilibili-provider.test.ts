import { describe, expect, it, vi } from "vitest";

import { bilibiliVideoProvider } from "./bilibili-provider";
import { resolveVideoProvider } from "./video-provider";

describe("Bilibili video provider", () => {
  it("matches and extracts single-video Bilibili URLs", () => {
    const url = "https://www.bilibili.com/video/BV1mock001/?spm_id_from=333.1007";

    expect(bilibiliVideoProvider.match(url)).toBe(true);
    expect(bilibiliVideoProvider.extractExternalVideoId(url)).toBe("BV1mock001");
    expect(resolveVideoProvider(url).platform).toBe("bilibili");
  });

  it("normalizes untrusted metadata and keeps raw source tags hidden", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          bvid: "BV1mock001",
          cid: 9988,
          title: "AI 长期记忆：从产品到实现",
          desc: "原视频简介",
          pic: "//i0.hdslb.com/bfs/archive/mock.jpg",
          duration: 125,
          pubdate: 1_788_000_000,
          owner: { name: "Mewmo Lab" },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: [{ tag_name: "人工智能" }, { tag_name: "产品设计" }, { tag_name: "" }],
      }));

    const metadata = await bilibiliVideoProvider.fetchMetadata(
      "https://www.bilibili.com/video/BV1mock001",
      { fetch: fetchImpl },
    );

    expect(metadata).toMatchObject({
      platform: "bilibili",
      externalVideoId: "BV1mock001",
      canonicalUrl: "https://www.bilibili.com/video/BV1mock001",
      title: "AI 长期记忆：从产品到实现",
      description: "原视频简介",
      coverImage: "https://i0.hdslb.com/bfs/archive/mock.jpg",
      durationSeconds: 125,
      author: "Mewmo Lab",
      sourceName: "哔哩哔哩",
      sourceTags: ["人工智能", "产品设计"],
    });
    expect(metadata.publishedAt).toBeInstanceOf(Date);
  });

  it("fetches and normalizes timestamped subtitles", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { cid: 9988 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          subtitle: {
            subtitles: [
              {
                lan: "zh-CN",
                lan_doc: "中文（自动生成）",
                subtitle_url: "//aisubtitle.hdslb.com/mock.json",
              },
            ],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        body: [
          { from: 0, to: 4.2, content: "先理解什么是长期记忆" },
          { from: 4.2, to: 8.5, content: "它不是无限追加上下文" },
        ],
      }));

    const transcript = await bilibiliVideoProvider.fetchTranscript(
      {
        url: "https://www.bilibili.com/video/BV1mock001",
        externalVideoId: "BV1mock001",
      },
      { fetch: fetchImpl },
    );

    expect(transcript).toEqual({
      language: "zh-CN",
      segments: [
        { startSeconds: 0, endSeconds: 4.2, text: "先理解什么是长期记忆" },
        { startSeconds: 4.2, endSeconds: 8.5, text: "它不是无限追加上下文" },
      ],
    });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://aisubtitle.hdslb.com/mock.json",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("returns an honest empty transcript when Bilibili exposes no subtitles", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { cid: 9988 } }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { subtitle: { subtitles: [] } },
      }));

    await expect(
      bilibiliVideoProvider.fetchTranscript(
        {
          url: "https://www.bilibili.com/video/BV1mock001",
          externalVideoId: "BV1mock001",
        },
        { fetch: fetchImpl },
      ),
    ).resolves.toEqual({ language: null, segments: [] });
  });

  it("rejects unsupported URLs and malformed provider responses", async () => {
    expect(() => resolveVideoProvider("https://example.com/video/1")).toThrow("Unsupported video URL");

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: 0, data: { title: "missing id" } }));
    await expect(
      bilibiliVideoProvider.fetchMetadata("https://www.bilibili.com/video/BV1mock001", {
        fetch: fetchImpl,
      }),
    ).rejects.toThrow("invalid metadata");
  });
});

function jsonResponse(value: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => value,
    text: async () => JSON.stringify(value),
  } as Response;
}
