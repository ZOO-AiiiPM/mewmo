export type VideoPlatform = "bilibili" | "youtube";

export type VideoProcessingStatus =
  | "fetching_metadata"
  | "fetching_transcript"
  | "analyzing"
  | "ready"
  | "no_transcript"
  | "failed";

export type VideoWatchStatus = "unwatched" | "watching" | "watched";
export interface VideoSource {
  id: string;
  title: string;
  url: string;
  type: "video";
  platform: VideoPlatform;
  favicon: string | null;
  unreadCount: number;
  lastFetchedAt: string | null;
}

export interface VideoListItem {
  id: string;
  sourceId: string;
  platform: VideoPlatform;
  title: string;
  url: string;
  creatorName: string;
  durationSeconds: number | null;
  publishedAt: string | null;
  summary: string | null;
  processingStatus: VideoProcessingStatus;
  watchStatus: VideoWatchStatus;
  progressSeconds: number;
  isFavorited: boolean;
  coverImage: string;
  mockVideoUrl: string;
}

export interface VideoChapter {
  id: string;
  startSeconds: number;
  endSeconds: number | null;
  title: string;
  theme: string;
  summary: string;
}

export interface VideoTranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface VideoHighlight {
  id: string;
  startSeconds: number;
  title: string;
  note: string;
  score?: number;
}

export interface VideoTerm {
  term: string;
  explanation: string;
}

export interface VideoQuickJudgment {
  summary: string;
  highlights: string[];
  thoughts: string[];
  terms: VideoTerm[];
}

export interface VideoVisualCard {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
}

export interface VideoDetail extends VideoListItem {
  quickJudgment: VideoQuickJudgment | null;
  keyPoints: string[];
  targetAudience: string | null;
  chapters: VideoChapter[];
  transcript: VideoTranscriptSegment[];
  highlights: VideoHighlight[];
  visualSummary: VideoVisualCard[];
}
