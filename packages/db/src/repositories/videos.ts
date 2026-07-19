import type {
  VideoAnalysisResult,
  VideoPlatform,
  VideoProcessingStatus,
  VideoTranscriptSegment,
} from "@mewmo/shared";

import { getPrisma, Prisma } from "../client";
import { softDeleteData } from "./repository-utils";

export class VideoEntryNotFoundError extends Error {
  constructor() {
    super("Video entry was not found for the current user");
    this.name = "VideoEntryNotFoundError";
  }
}

export interface CreateVideoDetailInput {
  platform: VideoPlatform;
  externalVideoId: string;
  durationSeconds?: number | null;
  sourceTags?: string[] | null;
}

export interface CreateVideoHighlightInput {
  text: string;
  startSeconds?: number | null;
}

export interface UpdateVideoProcessingInput {
  processingStatus?: VideoProcessingStatus;
  processingError?: string | null;
  processingAttempts?: number;
  durationSeconds?: number | null;
  sourceTags?: string[] | null;
  transcript?: VideoTranscriptSegment[] | null;
  transcriptLanguage?: string | null;
  analysis?: VideoAnalysisResult | null;
  lastProcessedAt?: Date | null;
}

interface VideosClient {
  feedEntry: {
    findFirst(args: unknown): Promise<unknown>;
  };
  videoDetail: {
    findFirst(args: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  videoUserHighlight: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

const ownedVideoEntryWhere = (userId: string) => ({
  userId,
  deletedAt: null,
  feed: { userId, deletedAt: null, type: "video" as const },
});

export function createVideosRepository(client: unknown = getPrisma()) {
  const db = client as VideosClient;

  async function requireOwnedVideoEntry(userId: string, feedEntryId: string) {
    const entry = await db.feedEntry.findFirst({
      where: { id: feedEntryId, ...ownedVideoEntryWhere(userId) },
      select: { id: true },
    });

    if (!entry) {
      throw new VideoEntryNotFoundError();
    }
  }

  return {
    async findDetail(userId: string, feedEntryId: string) {
      const detail = await db.videoDetail.findFirst({
        where: {
          feedEntryId,
          feedEntry: ownedVideoEntryWhere(userId),
        },
      });
      if (!detail) return null;

      const userHighlights = await db.videoUserHighlight.findMany({
        where: {
          feedEntryId,
          userId,
          deletedAt: null,
          feedEntry: ownedVideoEntryWhere(userId),
        },
        orderBy: { createdAt: "asc" },
      });
      return { ...(detail as Record<string, unknown>), userHighlights };
    },

    async createDetail(userId: string, feedEntryId: string, input: CreateVideoDetailInput) {
      await requireOwnedVideoEntry(userId, feedEntryId);
      const inputData = {
        platform: input.platform,
        externalVideoId: input.externalVideoId,
        ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.sourceTags !== undefined
          ? { sourceTags: input.sourceTags === null ? Prisma.DbNull : input.sourceTags }
          : {}),
      };

      return db.videoDetail.upsert({
        where: { feedEntryId },
        create: { feedEntryId, ...inputData },
        update: {
          ...inputData,
          processingStatus: "fetching_metadata",
          processingError: null,
          transcript: Prisma.DbNull,
          transcriptLanguage: null,
          quickJudgment: Prisma.DbNull,
          keyPoints: Prisma.DbNull,
          targetAudience: null,
          chapters: Prisma.DbNull,
          aiHighlights: Prisma.DbNull,
          suggestedTags: Prisma.DbNull,
          analysisVersion: 1,
          processingAttempts: 0,
          lastProcessedAt: null,
        },
      });
    },

    async createHighlight(userId: string, feedEntryId: string, input: CreateVideoHighlightInput) {
      await requireOwnedVideoEntry(userId, feedEntryId);

      return db.videoUserHighlight.create({
        data: { feedEntryId, userId, ...input },
      });
    },

    async deleteHighlight(
      userId: string,
      feedEntryId: string,
      highlightId: string,
      now = new Date(),
    ) {
      const result = await db.videoUserHighlight.updateMany({
        where: {
          id: highlightId,
          feedEntryId,
          userId,
          deletedAt: null,
          feedEntry: ownedVideoEntryWhere(userId),
        },
        data: softDeleteData(now),
      });

      return result.count > 0;
    },
  };
}
