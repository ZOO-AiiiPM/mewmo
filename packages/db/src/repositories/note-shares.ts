import { getPrisma } from "../client";

const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface NoteSharesClient {
  noteShare: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

export function createNoteSharesRepository(client: unknown = getPrisma()) {
  const db = client as NoteSharesClient;

  return {
    async createOrReuse(ownerId: string, noteId: string, tokenFactory: () => string) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SHARE_TTL_MS);

      const existing = (await db.noteShare.findFirst({
        where: {
          ownerId,
          noteId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      })) as { id: string } | null;

      if (existing) {
        return db.noteShare.update({
          where: { id: existing.id },
          data: { expiresAt },
        });
      }

      return db.noteShare.create({
        data: { ownerId, noteId, token: tokenFactory(), expiresAt },
      });
    },
  };
}
