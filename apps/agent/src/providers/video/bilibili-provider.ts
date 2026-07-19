import type { VideoProviderAdapter, VideoProviderMetadata, VideoProviderOptions } from "./video-provider";

const BILIBILI_VIEW_URL = "https://api.bilibili.com/x/web-interface/view";
const BILIBILI_TAGS_URL = "https://api.bilibili.com/x/tag/archive/tags";
const BILIBILI_PLAYER_URL = "https://api.bilibili.com/x/player/v2";

const REQUEST_HEADERS = {
  Accept: "application/json",
  Referer: "https://www.bilibili.com/",
  "User-Agent": "Mozilla/5.0 Mewmo/1.0",
};

export const bilibiliVideoProvider: VideoProviderAdapter = {
  platform: "bilibili",

  match(url) {
    try {
      const parsed = new URL(url);
      return /(^|\.)bilibili\.com$/i.test(parsed.hostname) && /\/video\/BV[0-9A-Za-z]+/i.test(parsed.pathname);
    } catch {
      return false;
    }
  },

  extractExternalVideoId(url) {
    const matched = new URL(url).pathname.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1];
    if (!matched) {
      throw new Error("Unsupported Bilibili video URL");
    }
    return matched;
  },

  async fetchMetadata(url, options = {}) {
    const fetchImpl = options.fetch ?? fetch;
    const externalVideoId = this.extractExternalVideoId(url);
    const view = await fetchBilibiliJson(
      `${BILIBILI_VIEW_URL}?bvid=${encodeURIComponent(externalVideoId)}`,
      fetchImpl,
    );
    const data = providerData(view);

    if (
      !isRecord(data) ||
      typeof data.bvid !== "string" ||
      typeof data.title !== "string" ||
      typeof data.desc !== "string"
    ) {
      throw new Error("Bilibili returned invalid metadata");
    }

    const sourceTags = await fetchSourceTags(externalVideoId, fetchImpl);
    const owner = isRecord(data.owner) ? data.owner : null;

    return {
      platform: "bilibili",
      externalVideoId: data.bvid,
      canonicalUrl: `https://www.bilibili.com/video/${data.bvid}`,
      title: data.title.trim(),
      description: data.desc.trim(),
      coverImage: typeof data.pic === "string" && data.pic ? absoluteHttpsUrl(data.pic) : null,
      durationSeconds: finiteNonNegativeNumber(data.duration),
      author: owner && typeof owner.name === "string" ? owner.name.trim() || null : null,
      sourceName: "哔哩哔哩",
      publishedAt:
        typeof data.pubdate === "number" && Number.isFinite(data.pubdate) && data.pubdate > 0
          ? new Date(data.pubdate * 1000)
          : null,
      sourceTags,
    } satisfies VideoProviderMetadata;
  },

  async fetchTranscript(input, options = {}) {
    const fetchImpl = options.fetch ?? fetch;
    const view = await fetchBilibiliJson(
      `${BILIBILI_VIEW_URL}?bvid=${encodeURIComponent(input.externalVideoId)}`,
      fetchImpl,
    );
    const viewData = providerData(view);
    if (!isRecord(viewData) || finiteNonNegativeNumber(viewData.cid) === null) {
      throw new Error("Bilibili returned invalid metadata for transcript lookup");
    }

    const cid = finiteNonNegativeNumber(viewData.cid) as number;
    const player = await fetchBilibiliJson(
      `${BILIBILI_PLAYER_URL}?bvid=${encodeURIComponent(input.externalVideoId)}&cid=${cid}`,
      fetchImpl,
    );
    const playerData = providerData(player);
    if (!isRecord(playerData)) {
      throw new Error("Bilibili returned invalid player metadata");
    }

    const subtitleRoot = isRecord(playerData.subtitle) ? playerData.subtitle : null;
    const subtitles = subtitleRoot && Array.isArray(subtitleRoot.subtitles) ? subtitleRoot.subtitles : [];
    const selected = selectSubtitle(subtitles);
    if (!selected) {
      return { language: null, segments: [] };
    }

    const subtitlePayload = await fetchJson(absoluteHttpsUrl(selected.subtitleUrl), fetchImpl);
    if (!isRecord(subtitlePayload) || !Array.isArray(subtitlePayload.body)) {
      throw new Error("Bilibili returned invalid subtitle data");
    }

    const segments = subtitlePayload.body.flatMap((item) => {
      if (!isRecord(item)) return [];
      const startSeconds = finiteNonNegativeNumber(item.from);
      const endSeconds = finiteNonNegativeNumber(item.to);
      const text = typeof item.content === "string" ? item.content.trim() : "";
      if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds || !text) {
        return [];
      }
      return [{ startSeconds, endSeconds, text }];
    });

    return { language: selected.language, segments };
  },
};

async function fetchSourceTags(externalVideoId: string, fetchImpl: typeof fetch) {
  try {
    const payload = await fetchBilibiliJson(
      `${BILIBILI_TAGS_URL}?bvid=${encodeURIComponent(externalVideoId)}`,
      fetchImpl,
    );
    const data = providerData(payload);
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      if (!isRecord(item) || typeof item.tag_name !== "string") return [];
      const name = item.tag_name.trim();
      return name ? [name] : [];
    });
  } catch {
    return [];
  }
}

function selectSubtitle(values: unknown[]) {
  const normalized = values.flatMap((item) => {
    if (!isRecord(item) || typeof item.subtitle_url !== "string" || !item.subtitle_url) return [];
    return [{
      language: typeof item.lan === "string" && item.lan ? item.lan : "unknown",
      subtitleUrl: item.subtitle_url,
    }];
  });

  return (
    normalized.find((item) => /^(zh|ai-zh)/i.test(item.language)) ??
    normalized[0] ??
    null
  );
}

async function fetchBilibiliJson(url: string, fetchImpl: typeof fetch) {
  const value = await fetchJson(url, fetchImpl);
  if (!isRecord(value) || typeof value.code !== "number") {
    throw new Error("Bilibili returned an invalid API response");
  }
  if (value.code !== 0) {
    throw new Error(`Bilibili API request failed with code ${value.code}`);
  }
  return value;
}

async function fetchJson(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bilibili request failed: ${response.status} ${body}`.trim());
  }
  return response.json() as Promise<unknown>;
}

function providerData(payload: unknown) {
  return isRecord(payload) ? payload.data : undefined;
}

function finiteNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function absoluteHttpsUrl(value: string) {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://")) return `https://${value.slice("http://".length)}`;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
