import { getPrisma, Prisma, type PrismaClient } from "@mewmo/db";
import { notePreviewText } from "./note-list-preview";

const NOTE_PREVIEW_SOURCE_LIMIT = 4_096;

interface NoteListRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  pinned: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  previewSource: string;
}

export interface NoteListData {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  preview: string;
  pinned: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listNotesWithPreviews(
  userId: string,
  prisma: Pick<PrismaClient, "$queryRaw"> = getPrisma(),
): Promise<NoteListData[]> {
  const rows = await prisma.$queryRaw<NoteListRow[]>(Prisma.sql`
    SELECT
      id,
      slug,
      title,
      summary,
      pinned,
      version,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      LEFT(content, ${NOTE_PREVIEW_SOURCE_LIMIT}) AS "previewSource"
    FROM notes
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
    ORDER BY pinned DESC, updated_at DESC
  `);

  return rows.map(({ previewSource, ...note }) => ({
    ...note,
    preview: notePreviewText({ summary: null, content: previewSource }),
  }));
}
