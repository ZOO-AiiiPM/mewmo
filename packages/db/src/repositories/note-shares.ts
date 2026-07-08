import { getPrisma } from "../client";

interface NoteSharesClient {
  noteShare: {
    create(args: unknown): Promise<unknown>;
    findFirst(args: unknown): Promise<unknown>;
  };
}

export function createNoteSharesRepository(client: unknown = getPrisma()) {
  const db = client as NoteSharesClient;

  return {
    async createOrReuse(ownerId: string, noteId: string, tokenFactory: () => string) {
      const existing = await db.noteShare.findFirst({
        where: { ownerId, noteId, revokedAt: null },
      });
      if (existing) return existing;

      return db.noteShare.create({
        data: { ownerId, noteId, token: tokenFactory() },
      });
    },
  };
}
