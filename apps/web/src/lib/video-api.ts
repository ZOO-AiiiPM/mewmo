import type {
  UserVideoHighlight,
  VideoChapter,
  VideoDetail,
  VideoHighlight,
  VideoListItem,
  VideoPlatform,
  VideoProcessingStatus,
  VideoQuickJudgment,
  VideoSource,
  VideoTranscriptSegment,
} from "./video-types";

export interface VideoTagRecord {
  id?: string;
  name: string;
  color: string | null;
}

export async function fetchVideoSources() {
  const data = await requestJson<unknown[]>("/api/feeds?type=video");
  return data.map(mapVideoSource).filter((value): value is VideoSource => value !== null);
}

export async function fetchVideoEntries(feedId?: string | null) {
  const query = new URLSearchParams({ type: "video" });
  if (feedId) query.set("feedId", feedId);
  const data = await requestJson<unknown[]>(`/api/feed-entries?${query.toString()}`);
  return data.map(mapVideoListItem).filter((value): value is VideoListItem => value !== null);
}

export async function fetchVideoDetail(id: string) {
  return mapVideoDetail(await requestJson<unknown>(`/api/feed-entries/${encodeURIComponent(id)}`));
}

export async function fetchGlobalTags() {
  const data = await requestJson<unknown[]>("/api/tags");
  return data.flatMap((value) => {
    const record = asRecord(value);
    return typeof record?.name === "string"
      ? [{
          ...(typeof record.id === "string" ? { id: record.id } : {}),
          name: record.name,
          color: typeof record.color === "string" ? record.color : null,
        }]
      : [];
  });
}

export async function createVideo(url: string) {
  return requestJson<{ entry: { id: string; feedId: string } }>("/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export async function reanalyzeVideo(id: string) {
  return requestJson(`/api/videos/${encodeURIComponent(id)}/reanalyze`, { method: "POST" });
}

export async function deleteVideo(id: string) {
  return requestJson(`/api/feed-entries/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createVideoHighlight(id: string, text: string, startSeconds: number | null) {
  return requestJson<UserVideoHighlight>(`/api/videos/${encodeURIComponent(id)}/highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, startSeconds }),
  });
}

export async function deleteVideoHighlight(id: string, highlightId: string) {
  return requestJson(`/api/videos/${encodeURIComponent(id)}/highlights/${encodeURIComponent(highlightId)}`, {
    method: "DELETE",
  });
}

export async function replaceVideoTags(
  id: string,
  tags: Array<{ name: string; color?: string }>,
) {
  const result = await requestJson<{ tags: VideoTagRecord[] }>(
    `/api/feed-entries/${encodeURIComponent(id)}/tags`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    },
  );
  return result.tags;
}

export async function markVideoRead(id: string) {
  return requestJson(`/api/feed-entries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ read: true }),
  });
}

export async function favoriteVideo(id: string) {
  return requestJson(`/api/feed-entries/${encodeURIComponent(id)}/favorite`, { method: "POST" });
}

export function mapVideoSource(value: unknown): VideoSource | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.title !== "string" || typeof record.url !== "string") {
    return null;
  }
  return {
    id: record.id,
    title: record.title,
    url: record.url,
    type: "video",
    platform: inferPlatform(record.url),
    favicon: typeof record.favicon === "string" ? record.favicon : null,
    unreadCount: finiteNumber(record.unreadCount) ?? 0,
    lastFetchedAt: stringOrNull(record.lastFetchedAt),
  };
}

export function mapVideoListItem(value: unknown): VideoListItem | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.url !== "string" || typeof record.title !== "string") {
    return null;
  }
  const feed = asRecord(record.feed);
  const detail = asRecord(record.videoDetail);
  const tags = normalizeTags(record.tags);
  const platform = normalizePlatform(detail?.platform) ?? inferPlatform(record.url);
  const description = typeof record.content === "string" ? record.content : "";
  const summary = stringOrNull(record.summary);

  return {
    id: record.id,
    sourceId: typeof record.feedId === "string" ? record.feedId : typeof feed?.id === "string" ? feed.id : "",
    platform,
    title: record.title,
    url: record.url,
    creatorName:
      stringOrNull(record.sourceName) ??
      stringOrNull(record.author) ??
      stringOrNull(feed?.title) ??
      (platform === "bilibili" ? "哔哩哔哩" : "YouTube"),
    durationSeconds: finiteNumber(detail?.durationSeconds),
    publishedAt: stringOrNull(record.publishedAt) ?? stringOrNull(record.createdAt),
    preview: compactText(stringOrNull(record.excerpt) ?? summary ?? description),
    sourceTags: stringArray(detail?.sourceTags),
    mewmoTags: tags.map((tag) => tag.name),
    mewmoTagColors: Object.fromEntries(tags.flatMap((tag) => tag.color ? [[tag.name, tag.color]] : [])),
    summary,
    processingStatus: normalizeProcessingStatus(detail?.processingStatus),
    isUnread: record.readAt === null || record.readAt === undefined,
    watchStatus: "unwatched",
    progressSeconds: 0,
    isFavorited: record.isFavorited === true,
    coverImage: stringOrNull(record.coverImage),
    mockVideoUrl: null,
    embedUrl: buildEmbedUrl(record.url),
  };
}

export function mapVideoDetail(value: unknown): VideoDetail | null {
  const list = mapVideoListItem(value);
  const record = asRecord(value);
  const detail = asRecord(record?.videoDetail);
  if (!list || !record || !detail) return null;

  return {
    ...list,
    description: stringOrNull(record.content),
    suggestedTags: stringArray(detail.suggestedTags),
    quickJudgment: normalizeQuickJudgment(detail.quickJudgment),
    keyPoints: stringArray(detail.keyPoints),
    targetAudience: stringOrNull(detail.targetAudience),
    chapters: normalizeChapters(detail.chapters, list.id),
    transcript: normalizeTranscript(detail.transcript, list.id),
    highlights: normalizeHighlights(detail.aiHighlights, list.id),
    visualSummary: [],
    userHighlights: normalizeUserHighlights(detail.userHighlights),
  };
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok || data === null) {
    throw new Error(data?.error ?? `Request failed with status ${response.status}`);
  }
  return data;
}

function normalizeQuickJudgment(value: unknown): VideoQuickJudgment | null {
  const record = asRecord(value);
  if (!record || typeof record.summary !== "string") return null;
  return {
    summary: record.summary,
    highlights: stringArray(record.highlights),
    thoughts: stringArray(record.thoughts),
    terms: Array.isArray(record.terms)
      ? record.terms.flatMap((term) => {
          const item = asRecord(term);
          return typeof item?.term === "string" && typeof item.explanation === "string"
            ? [{ term: item.term, explanation: item.explanation }]
            : [];
        })
      : [],
  };
}

function normalizeChapters(value: unknown, entryId: string): VideoChapter[] {
  return Array.isArray(value) ? value.flatMap((chapter, index) => {
    const record = asRecord(chapter);
    const startSeconds = finiteNumber(record?.startSeconds);
    if (!record || startSeconds === null || typeof record.title !== "string") return [];
    return [{
      id: `${entryId}-chapter-${index}`,
      startSeconds,
      endSeconds: finiteNumber(record.endSeconds),
      title: record.title,
      theme: typeof record.theme === "string" ? record.theme : "未分类",
      summary: typeof record.summary === "string" ? record.summary : "",
    }];
  }) : [];
}

function normalizeTranscript(value: unknown, entryId: string): VideoTranscriptSegment[] {
  return Array.isArray(value) ? value.flatMap((segment, index) => {
    const record = asRecord(segment);
    const startSeconds = finiteNumber(record?.startSeconds);
    const endSeconds = finiteNumber(record?.endSeconds);
    if (!record || startSeconds === null || endSeconds === null || typeof record.text !== "string") return [];
    return [{ id: `${entryId}-segment-${index}`, startSeconds, endSeconds, text: record.text }];
  }) : [];
}

function normalizeHighlights(value: unknown, entryId: string): VideoHighlight[] {
  return Array.isArray(value) ? value.flatMap((highlight, index) => {
    const record = asRecord(highlight);
    const startSeconds = finiteNumber(record?.startSeconds);
    if (!record || startSeconds === null || typeof record.title !== "string" || typeof record.note !== "string") return [];
    const score = finiteNumber(record.score);
    return [{
      id: `${entryId}-highlight-${index}`,
      startSeconds,
      title: record.title,
      note: record.note,
      ...(score !== null ? { score } : {}),
    }];
  }) : [];
}

function normalizeUserHighlights(value: unknown): UserVideoHighlight[] {
  return Array.isArray(value) ? value.flatMap((highlight) => {
    const record = asRecord(highlight);
    if (!record || typeof record.id !== "string" || typeof record.text !== "string") return [];
    return [{
      id: record.id,
      text: record.text,
      startSeconds: finiteNumber(record.startSeconds),
      createdAt: stringOrNull(record.createdAt) ?? new Date(0).toISOString(),
    }];
  }) : [];
}

function normalizeTags(value: unknown): VideoTagRecord[] {
  return Array.isArray(value) ? value.flatMap((tag) => {
    const record = asRecord(tag);
    return typeof record?.name === "string"
      ? [{
          ...(typeof record.id === "string" ? { id: record.id } : {}),
          name: record.name,
          color: typeof record.color === "string" ? record.color : null,
        }]
      : [];
  }) : [];
}

function normalizePlatform(value: unknown): VideoPlatform | null {
  return value === "bilibili" || value === "youtube" ? value : null;
}

function normalizeProcessingStatus(value: unknown): VideoProcessingStatus {
  return value === "fetching_metadata" ||
    value === "fetching_transcript" ||
    value === "analyzing" ||
    value === "ready" ||
    value === "no_transcript" ||
    value === "failed"
    ? value
    : "fetching_metadata";
}

function inferPlatform(url: string): VideoPlatform {
  return url.includes("youtu") ? "youtube" : "bilibili";
}

function buildEmbedUrl(url: string) {
  const bvid = url.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1];
  if (bvid) return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1&high_quality=1&danmaku=0&autoplay=0`;
  try {
    const parsed = new URL(url);
    const videoId = parsed.hostname.includes("youtu.be")
      ? parsed.pathname.slice(1)
      : parsed.searchParams.get("v");
    return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : null;
  } catch {
    return null;
  }
}

function compactText(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "视频信息正在获取。";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function stringOrNull(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value ? value : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
