import { readNoteDraft, removeNoteDraft, writeNoteDraft, type NoteDraft } from "./note-draft-store";

export type NoteSaveStatus = "saving" | "saved" | "offline" | "error";
export interface NoteSaveSnapshot {
  status: NoteSaveStatus;
  message: string;
  serverVersion?: number;
  title?: string;
  slug?: string;
}

const messages: Record<NoteSaveStatus, string> = {
  saving: "保存中…",
  saved: "已保存",
  offline: "离线，已保存在本机",
  error: "保存失败",
};

interface PendingSync {
  draft: NoteDraft;
  timer: ReturnType<typeof setTimeout> | null;
  retryDelayMs: number;
}

const pending = new Map<string, PendingSync>();
const snapshots = new Map<string, NoteSaveSnapshot>();
const listeners = new Map<string, Set<(snapshot: NoteSaveSnapshot) => void>>();
const keyFor = (userId: string, noteId: string) => `${userId}:${noteId}`;

function emit(key: string, status: NoteSaveStatus, saved?: { version?: number; title?: string; slug?: string }) {
  const snapshot: NoteSaveSnapshot = {
    status,
    message: messages[status],
    ...(saved?.version !== undefined ? { serverVersion: saved.version } : {}),
    ...(saved?.title !== undefined ? { title: saved.title } : {}),
    ...(saved?.slug !== undefined ? { slug: saved.slug } : {}),
  };
  snapshots.set(key, snapshot);
  for (const listener of listeners.get(key) ?? []) listener(snapshot);
}

export function subscribeNoteDraftSync(
  userId: string,
  noteId: string,
  listener: (snapshot: NoteSaveSnapshot) => void,
) {
  const key = keyFor(userId, noteId);
  const group = listeners.get(key) ?? new Set();
  group.add(listener);
  listeners.set(key, group);
  listener(snapshots.get(key) ?? { status: "saved", message: messages.saved });
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(key);
  };
}

export function queueNoteDraftSync(draft: NoteDraft, delayMs = 800) {
  const key = keyFor(draft.userId, draft.noteId);
  if (!writeNoteDraft(draft).ok) {
    emit(key, "error");
    return;
  }
  const existing = pending.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  pending.set(key, {
    draft,
    retryDelayMs: existing?.retryDelayMs ?? 2000,
    timer: setTimeout(() => void flush(key, draft), delayMs),
  });
  emit(key, "saving");
}

export function retryStoredNoteDraft(userId: string, noteId: string) {
  const draft = readNoteDraft(userId, noteId);
  if (!draft) return;
  queueNoteDraftSync(draft, 0);
}

async function flush(key: string, submitted: NoteDraft) {
  const current = pending.get(key);
  if (!current || current.draft.updatedAt !== submitted.updatedAt) return;
  current.timer = null;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    emit(key, "offline");
    scheduleRetry(key, submitted);
    return;
  }

  try {
    const response = await fetch(`/api/notes/${submitted.noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: submitted.title,
        content: submitted.content,
        expectedVersion: submitted.serverVersion,
      }),
    });
    if (!response.ok) {
      emit(key, "error");
      return;
    }
    const saved = (await response.json()) as { version?: number; title?: string; slug?: string };
    const latest = pending.get(key);
    if (latest?.draft.updatedAt === submitted.updatedAt) {
      pending.delete(key);
      removeNoteDraft(submitted.userId, submitted.noteId, submitted.updatedAt);
      emit(key, "saved", saved);
    } else if (latest && typeof saved.version === "number") {
      latest.draft = { ...latest.draft, serverVersion: saved.version };
      writeNoteDraft(latest.draft);
    }
  } catch {
    emit(key, "offline");
    scheduleRetry(key, submitted);
  }
}

function scheduleRetry(key: string, draft: NoteDraft) {
  const current = pending.get(key);
  if (!current || current.draft.updatedAt !== draft.updatedAt) return;
  const delay = current.retryDelayMs;
  current.retryDelayMs = Math.min(delay * 2, 30000);
  current.timer = setTimeout(() => void flush(key, draft), delay);
}
