export interface NoteDraft {
  userId: string;
  noteId: string;
  title: string;
  content: string;
  serverVersion: number;
  updatedAt: number;
}

type DraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function noteDraftKey(userId: string, noteId: string) {
  return `mewmo:note-draft:${userId}:${noteId}`;
}

export function readNoteDraft(userId: string, noteId: string, storage = browserDraftStorage()) {
  if (!storage) return null;
  const key = noteDraftKey(userId, noteId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<NoteDraft>;
    if (
      value.userId !== userId || value.noteId !== noteId ||
      typeof value.title !== "string" || typeof value.content !== "string" ||
      typeof value.serverVersion !== "number" || typeof value.updatedAt !== "number"
    ) {
      storage.removeItem(key);
      return null;
    }
    return value as NoteDraft;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeNoteDraft(draft: NoteDraft, storage = browserDraftStorage()) {
  if (!storage) return { ok: false as const };
  try {
    storage.setItem(noteDraftKey(draft.userId, draft.noteId), JSON.stringify(draft));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

export function removeNoteDraft(
  userId: string,
  noteId: string,
  expectedUpdatedAt?: number,
  storage = browserDraftStorage(),
) {
  if (!storage) return;
  if (expectedUpdatedAt !== undefined) {
    const current = readNoteDraft(userId, noteId, storage);
    if (current?.updatedAt !== expectedUpdatedAt) return;
  }
  storage.removeItem(noteDraftKey(userId, noteId));
}

export function removeLegacyNoteDraft(noteId: string, storage = browserDraftStorage()) {
  storage?.removeItem(`mewmo:note-content-draft:${noteId}`);
}

function browserDraftStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage as DraftStorage;
}
