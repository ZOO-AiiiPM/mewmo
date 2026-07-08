export interface NoteContentDraft {
  content: string;
  updatedAt: number;
}

type DraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const NOTE_CONTENT_DRAFT_PREFIX = "mewmo:note-content-draft:";

export function noteContentDraftKey(noteId: string) {
  return `${NOTE_CONTENT_DRAFT_PREFIX}${noteId}`;
}

export function readNoteContentDraft(
  noteId: string,
  storage = browserDraftStorage(),
): NoteContentDraft | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(noteContentDraftKey(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NoteContentDraft>;
    if (typeof parsed.content !== "string" || typeof parsed.updatedAt !== "number") {
      storage.removeItem(noteContentDraftKey(noteId));
      return null;
    }
    return { content: parsed.content, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function writeNoteContentDraft(
  noteId: string,
  content: string,
  storage = browserDraftStorage(),
) {
  if (!storage) return;

  storage.setItem(
    noteContentDraftKey(noteId),
    JSON.stringify({ content, updatedAt: Date.now() } satisfies NoteContentDraft),
  );
}

export function removeNoteContentDraft(
  noteId: string,
  storage = browserDraftStorage(),
) {
  storage?.removeItem(noteContentDraftKey(noteId));
}

export function resolveInitialNoteContent(
  serverContent: string,
  draft: NoteContentDraft | null,
) {
  return draft?.content ?? serverContent;
}

function browserDraftStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage as DraftStorage;
}
