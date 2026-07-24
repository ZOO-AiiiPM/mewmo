"use client";

import { useEffect, useMemo, useState } from "react";
import { formatKnowledgeImportPreviewParagraphs } from "../../lib/knowledge-import-preview";
import { PrototypeIcon } from "../shell/PrototypeIcon";

type ImportTab = "notes" | "clips";
type ImportKind = "note" | "clip";

interface KnowledgeImportModalProps {
  open: boolean;
  knowledgeBaseId: string | null;
  folderId?: string | null;
  onClose: () => void;
  onImported: () => void;
}

interface ImportCandidate {
  id: string;
  kind: ImportKind;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl?: string;
  content?: string;
  noteId?: string;
  clipId?: string;
}

interface ImportedKnowledgeItem {
  kind: ImportKind | "feed_entry" | "asset";
  note?: { id: string } | null;
  clip?: { id: string } | null;
}

const MODAL_EXIT_MS = 160;

export function KnowledgeImportModal({
  open,
  knowledgeBaseId,
  folderId = null,
  onClose,
  onImported,
}: KnowledgeImportModalProps) {
  const [mounted, setMounted] = useState(open);
  const [tab, setTab] = useState<ImportTab>("notes");
  const [notes, setNotes] = useState<ImportCandidate[]>([]);
  const [clips, setClips] = useState<ImportCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(() => new Set());
  const [previewId, setPreviewId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [noteContents, setNoteContents] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    const timer = window.setTimeout(() => setMounted(false), MODAL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setImportedIds(new Set());
    setTab("notes");
    setPreviewId("");
    setError("");
    let cancelled = false;

    async function loadCandidates() {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);

      const [noteResponse, clipResponse, contentsResponse] = await Promise.all([
        fetch("/api/notes").catch(() => null),
        fetch("/api/clips?includeContent=1").catch(() => null),
        knowledgeBaseId
          ? fetch(`/api/knowledge-bases/${knowledgeBaseId}/contents?${params.toString()}`).catch(
              () => null,
            )
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      if (contentsResponse?.ok) {
        const data = (await contentsResponse.json()) as ImportedKnowledgeItem[];
        if (!cancelled) {
          setImportedIds(new Set(data.map(candidateIdFromImportedItem).filter(isImportCandidateId)));
        }
      }

      if (noteResponse?.ok) {
        const data = (await noteResponse.json()) as Array<{
          id: string;
          title: string;
          summary?: string | null;
          content?: string | null;
        }>;
        setNotes(
          data.slice(0, 12).map((note) => ({
                id: `real-note:${note.id}`,
                kind: "note" as const,
                title: note.title,
                summary: note.summary || note.content || "笔记内容",
                sourceName: "笔记",
                noteId: note.id,
                content: note.content ?? "",
              })),
        );
      }

      if (clipResponse?.ok) {
        const data = (await clipResponse.json()) as Array<{
          id: string;
          title: string;
          content?: string | null;
          summary?: string | null;
          excerpt?: string | null;
          url: string;
          sourceName?: string | null;
        }>;
        setClips(
          data.slice(0, 12).map((clip) => ({
                id: `real-clip:${clip.id}`,
                kind: "clip" as const,
                title: clip.title,
                summary: clip.summary || clip.excerpt || clip.url,
                sourceName: clip.sourceName || domainFromUrl(clip.url),
                sourceUrl: clip.url,
                content: clip.content ?? "",
                clipId: clip.id,
              })),
        );
      }
    }

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [folderId, knowledgeBaseId, open]);

  const activeCandidates = tab === "notes" ? notes : clips;
  const allCandidates = useMemo(() => [...notes, ...clips], [clips, notes]);
  const selectedCount = selectedIds.size;
  const preview =
    allCandidates.find((item) => item.id === previewId) ??
    activeCandidates[0] ??
    allCandidates[0];
  const previewContent =
    preview && preview.kind === "note" && preview.noteId && noteContents[preview.noteId] !== undefined
      ? noteContents[preview.noteId]
      : (preview?.content ?? "");
  const previewParagraphs = previewContent
    ? formatKnowledgeImportPreviewParagraphs(previewContent, preview?.sourceUrl)
    : [];

  useEffect(() => {
    if (!preview || preview.kind !== "note" || !preview.noteId) return;
    if (preview.content) return;
    const noteId = preview.noteId;
    if (noteContents[noteId] !== undefined) return;
    let cancelled = false;
    fetch(`/api/notes/${noteId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const content = data && typeof data.content === "string" ? data.content : "";
        setNoteContents((prev) => ({ ...prev, [noteId]: content }));
      })
      .catch(() => {
        if (!cancelled) setNoteContents((prev) => ({ ...prev, [noteId]: "" }));
      });
    return () => {
      cancelled = true;
    };
  }, [preview, noteContents]);

  if (!mounted) return null;

  const toggleSelected = (candidate: ImportCandidate) => {
    if (importedIds.has(candidate.id)) {
      setPreviewId(candidate.id);
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidate.id)) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });
    setPreviewId(candidate.id);
  };

  const submitImport = async () => {
    if (!knowledgeBaseId || selectedCount === 0) return;
    setSubmitting(true);
    setError("");

    try {
      const selected = allCandidates.filter((item) => selectedIds.has(item.id));
      const items = [];
      for (const candidate of selected) {
        if (candidate.kind === "note") {
          if (!candidate.noteId) throw new Error("missing note");
          items.push({ kind: "note", noteId: candidate.noteId });
        } else {
          if (!candidate.clipId) throw new Error("missing clip");
          items.push({ kind: "clip", clipId: candidate.clipId });
        }
      }

      const response = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/items/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folderId ?? null, items }),
        },
      );
      if (!response.ok) throw new Error("import");
      onImported();
      onClose();
    } catch {
      setError("导入失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="mewmo-knowledge-import modal modal--wide"
      data-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        className="modal__scrim"
        aria-label="关闭导入"
        onClick={onClose}
      />
      <section className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="knowledge-import-title">
        <header className="modal__head">
          <h3 id="knowledge-import-title">从收藏箱导入</h3>
          <button type="button" className="ib" onClick={onClose} aria-label="关闭">
            <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
          </button>
        </header>

        <div className="modal__body">
          <div className="imp-tabs" role="tablist" aria-label="导入类型">
            <button
              type="button"
              className={`imp-tab ${tab === "notes" ? "on" : ""}`}
              onClick={() => {
                setTab("notes");
                setPreviewId(notes[0]?.id ?? "");
              }}
            >
              笔记
            </button>
            <button
              type="button"
              className={`imp-tab ${tab === "clips" ? "on" : ""}`}
              onClick={() => {
                setTab("clips");
                setPreviewId(clips[0]?.id ?? "");
              }}
            >
              剪藏
            </button>
          </div>

          <div className="imp-cols">
            <div className="imp-left">
              {activeCandidates.map((candidate) => {
                const checked = importedIds.has(candidate.id) || selectedIds.has(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`imp-row ${checked ? "on" : ""} ${preview?.id === candidate.id ? "active" : ""}`}
                    onClick={() => setPreviewId(candidate.id)}
                  >
                    <span
                      className="imp-cb"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSelected(candidate);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <PrototypeIcon
                      name={candidate.kind === "note" ? "note" : "bookmark"}
                      size={15}
                      className="imp-row__ic"
                    />
                    <span className="imp-row__main">
                      <span className="imp-row__title">{candidate.title}</span>
                      <span className="imp-row__src">{candidate.sourceName}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <article className="imp-right">
              {preview && (
                <div className="imp-detail">
                  <h2 className="imp-detail__title">{preview.title}</h2>
                  <div className="imp-detail__meta">
                    <PrototypeIcon
                      name={preview.kind === "note" ? "note" : "bookmark"}
                      size={15}
                      className="imp-row__ic"
                    />
                    <span>{preview.sourceName}</span>
                  </div>
                  <div className="imp-detail__body">
                    {previewParagraphs.map((paragraph, index) => (
                      <p key={`${preview.id}-${index}`}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>

        {error && <p className="modal__error">{error}</p>}
        <footer className="modal__foot">
          <button type="button" className="mewmo-button mewmo-button--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="mewmo-button"
            onClick={() => void submitImport()}
            disabled={submitting || selectedCount === 0}
          >
            导入 {selectedCount} 项
          </button>
        </footer>
      </section>
    </div>
  );
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function candidateIdFromImportedItem(item: ImportedKnowledgeItem) {
  if (item.kind === "note" && item.note?.id) return `real-note:${item.note.id}`;
  if (item.kind === "clip" && item.clip?.id) return `real-clip:${item.clip.id}`;
  return null;
}

function isImportCandidateId(id: string | null): id is string {
  return Boolean(id);
}
