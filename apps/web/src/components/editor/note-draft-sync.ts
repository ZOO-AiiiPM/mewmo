import {
  removeNoteContentDraft,
  writeNoteContentDraft,
} from "./note-draft-store";

interface PendingNoteContentSync {
  content: string;
  retryDelayMs: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const FIRST_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;
const pendingContentSyncs = new Map<string, PendingNoteContentSync>();

export function queueNoteContentSync(noteId: string, content: string, delayMs = 800) {
  writeNoteContentDraft(noteId, content);
  scheduleNoteContentSync(noteId, content, delayMs);
}

export function retryStoredNoteContent(noteId: string, content: string) {
  scheduleNoteContentSync(noteId, content, 0);
}

function scheduleNoteContentSync(noteId: string, content: string, delayMs: number) {
  const existing = pendingContentSyncs.get(noteId);
  if (existing?.timer) clearTimeout(existing.timer);

  const next: PendingNoteContentSync = {
    content,
    retryDelayMs: existing?.retryDelayMs ?? FIRST_RETRY_DELAY_MS,
    timer: setTimeout(() => {
      void flushNoteContentSync(noteId, content);
    }, delayMs),
  };
  pendingContentSyncs.set(noteId, next);
}

async function flushNoteContentSync(noteId: string, content: string) {
  const current = pendingContentSyncs.get(noteId);
  if (!current || current.content !== content) return;
  current.timer = null;

  try {
    const response = await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error("Save failed");

    const latest = pendingContentSyncs.get(noteId);
    if (latest?.content === content) {
      pendingContentSyncs.delete(noteId);
      removeNoteContentDraft(noteId);
    }
  } catch {
    const latest = pendingContentSyncs.get(noteId);
    if (!latest || latest.content !== content) return;

    const retryDelayMs = latest.retryDelayMs;
    pendingContentSyncs.set(noteId, {
      content,
      retryDelayMs: Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS),
      timer: setTimeout(() => {
        void flushNoteContentSync(noteId, content);
      }, retryDelayMs),
    });
  }
}
