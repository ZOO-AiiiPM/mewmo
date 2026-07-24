import { readNoteDraft, removeNoteDraft, writeNoteDraft, type NoteDraft } from "./note-draft-store";

export type NoteSaveStatus = "saving" | "saved" | "offline" | "error" | "conflict";

export interface NoteSaveConflict {
  localTitle: string;
  localContent: string;
  remoteTitle: string;
  remoteContent: string;
  remoteVersion: number;
}

export interface NoteSaveSnapshot {
  status: NoteSaveStatus;
  message: string;
  serverVersion?: number;
  title?: string;
  slug?: string;
  content?: string;
  savedAt?: number;
  draftUpdatedAt?: number;
  resolvedWithRemote?: boolean;
  conflict?: NoteSaveConflict;
}

const messages: Record<NoteSaveStatus, string> = {
  saving: "保存中…",
  saved: "已保存",
  offline: "保存失败",
  error: "保存失败",
  conflict: "保存失败",
};

interface PendingSync {
  draft: NoteDraft;
  timer: ReturnType<typeof setTimeout> | null;
  retryDelayMs: number;
  inFlight: boolean;
}

interface NoteResponse {
  id: string;
  title: string;
  content: string;
  version: number;
  updatedAt?: string;
  slug?: string;
}

const pending = new Map<string, PendingSync>();
const snapshots = new Map<string, NoteSaveSnapshot>();
const listeners = new Map<string, Set<(snapshot: NoteSaveSnapshot) => void>>();
const keyFor = (userId: string, noteId: string) => `${userId}:${noteId}`;

function emit(key: string, status: NoteSaveStatus, details: Partial<NoteSaveSnapshot> = {}) {
  const snapshot: NoteSaveSnapshot = {
    status,
    message: messages[status],
    ...details,
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
    emit(key, "error", { draftUpdatedAt: draft.updatedAt });
    return;
  }

  const existing = pending.get(key);
  if (existing?.timer) clearTimeout(existing.timer);
  pending.set(key, {
    draft,
    retryDelayMs: existing?.retryDelayMs ?? 2000,
    timer:
      existing?.inFlight || snapshots.get(key)?.status === "conflict"
        ? null
        : setTimeout(() => void flush(key), delayMs),
    inFlight: existing?.inFlight ?? false,
  });
}

export function retryStoredNoteDraft(userId: string, noteId: string) {
  const draft = readNoteDraft(userId, noteId);
  if (!draft) return;
  queueNoteDraftSync(draft, 0);
}

export function resolveNoteDraftConflict(
  userId: string,
  noteId: string,
  choice: "local" | "remote",
) {
  const key = keyFor(userId, noteId);
  const current = pending.get(key);
  const snapshot = snapshots.get(key);
  const conflict = snapshot?.conflict;
  if (!current || !conflict) return false;

  if (choice === "remote") {
    pending.delete(key);
    removeNoteDraft(userId, noteId, current.draft.updatedAt);
    emit(key, "saved", {
      serverVersion: conflict.remoteVersion,
      title: conflict.remoteTitle,
      content: conflict.remoteContent,
      savedAt: Date.now(),
      draftUpdatedAt: current.draft.updatedAt,
      resolvedWithRemote: true,
    });
    return true;
  }

  const draft: NoteDraft = {
    ...current.draft,
    serverVersion: conflict.remoteVersion,
    baseTitle: conflict.remoteTitle,
    baseContent: conflict.remoteContent,
  };
  writeNoteDraft(draft);
  pending.set(key, {
    ...current,
    draft,
    timer: setTimeout(() => void flush(key), 0),
    inFlight: false,
  });
  return true;
}

async function flush(key: string) {
  const current = pending.get(key);
  if (!current || current.inFlight) return;
  current.timer = null;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    emit(key, "offline", { draftUpdatedAt: current.draft.updatedAt });
    scheduleRetry(key);
    return;
  }

  const submitted = current.draft;
  current.inFlight = true;
  emit(key, "saving", { draftUpdatedAt: submitted.updatedAt });

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

    if (response.status === 409) {
      await handleConflict(key, submitted);
      return;
    }
    if (!response.ok) {
      const latest = pending.get(key);
      if (latest) latest.inFlight = false;
      emit(key, "error", { draftUpdatedAt: submitted.updatedAt });
      return;
    }

    const saved = (await response.json()) as NoteResponse;
    const latest = pending.get(key);
    if (!latest || latest.draft.updatedAt === submitted.updatedAt) {
      pending.delete(key);
      removeNoteDraft(submitted.userId, submitted.noteId, submitted.updatedAt);
      emit(key, "saved", {
        serverVersion: saved.version,
        title: saved.title,
        ...(saved.slug !== undefined ? { slug: saved.slug } : {}),
        content: saved.content,
        savedAt: Date.now(),
        draftUpdatedAt: submitted.updatedAt,
      });
      return;
    }

    latest.inFlight = false;
    latest.draft = {
      ...latest.draft,
      serverVersion: saved.version,
      baseTitle: saved.title,
      baseContent: saved.content,
    };
    writeNoteDraft(latest.draft);
    latest.timer = setTimeout(() => void flush(key), 0);
  } catch {
    const latest = pending.get(key);
    if (latest) latest.inFlight = false;
    emit(key, "offline", { draftUpdatedAt: submitted.updatedAt });
    scheduleRetry(key);
  }
}

async function handleConflict(key: string, submitted: NoteDraft) {
  if (!pending.has(key)) return;

  try {
    const response = await fetch(`/api/notes/${submitted.noteId}`);
    if (!response.ok) throw new Error("failed to load current note");
    const remote = (await response.json()) as NoteResponse;
    const latest = pending.get(key);
    if (!latest) return;

    if (
      submitted.baseTitle !== undefined &&
      submitted.baseContent !== undefined &&
      remote.title === submitted.baseTitle &&
      remote.content === submitted.baseContent
    ) {
      latest.inFlight = false;
      latest.draft = {
        ...latest.draft,
        serverVersion: remote.version,
        baseTitle: remote.title,
        baseContent: remote.content,
      };
      writeNoteDraft(latest.draft);
      latest.timer = setTimeout(() => void flush(key), 0);
      return;
    }

    latest.inFlight = false;
    emit(key, "conflict", {
      draftUpdatedAt: latest.draft.updatedAt,
      serverVersion: remote.version,
      conflict: {
        localTitle: latest.draft.title,
        localContent: latest.draft.content,
        remoteTitle: remote.title,
        remoteContent: remote.content,
        remoteVersion: remote.version,
      },
    });
  } catch {
    const latest = pending.get(key);
    if (latest) latest.inFlight = false;
    emit(key, "error", { draftUpdatedAt: submitted.updatedAt });
  }
}

function scheduleRetry(key: string) {
  const current = pending.get(key);
  if (!current || current.timer || current.inFlight) return;
  const delay = current.retryDelayMs;
  current.retryDelayMs = Math.min(delay * 2, 30000);
  current.timer = setTimeout(() => void flush(key), delay);
}
