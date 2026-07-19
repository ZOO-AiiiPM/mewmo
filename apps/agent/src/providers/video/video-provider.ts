import type { VideoPlatform, VideoTranscriptSegment } from "@mewmo/shared";

import { bilibiliVideoProvider } from "./bilibili-provider";

export interface VideoProviderMetadata {
  platform: VideoPlatform;
  externalVideoId: string;
  canonicalUrl: string;
  title: string;
  description: string;
  coverImage: string | null;
  durationSeconds: number | null;
  author: string | null;
  sourceName: string;
  publishedAt: Date | null;
  sourceTags: string[];
}

export interface VideoTranscriptResult {
  language: string | null;
  segments: VideoTranscriptSegment[];
}

export interface VideoProviderOptions {
  fetch?: typeof fetch;
}

export interface VideoProviderAdapter {
  platform: VideoPlatform;
  match(url: string): boolean;
  extractExternalVideoId(url: string): string;
  fetchMetadata(url: string, options?: VideoProviderOptions): Promise<VideoProviderMetadata>;
  fetchTranscript(
    input: { url: string; externalVideoId: string },
    options?: VideoProviderOptions,
  ): Promise<VideoTranscriptResult>;
}

const providers: VideoProviderAdapter[] = [bilibiliVideoProvider];

export function resolveVideoProvider(url: string) {
  const provider = providers.find((candidate) => candidate.match(url));
  if (!provider) {
    throw new Error("Unsupported video URL");
  }
  return provider;
}
