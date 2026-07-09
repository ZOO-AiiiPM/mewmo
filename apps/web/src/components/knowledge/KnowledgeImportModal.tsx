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

const SAMPLE_NOTES: ImportCandidate[] = [
  {
    id: "note:0",
    kind: "note",
    title: "产品定位：一只猫的陪伴感从哪来",
    summary: "不是把 AI 做成助手图标，而是把信息整理的反馈做得足够温柔、明确、可持续。",
    sourceName: "笔记",
    content:
      "Mewmo 的核心不是替用户做所有判断，而是在用户收集和复盘时持续给出轻量、可信的陪伴感。",
  },
  {
    id: "note:1",
    kind: "note",
    title: "2.0 数据层验收清单",
    summary: "API 边界用共享 Zod schema，知识库目录、内容导入和软删除都要有最小回归测试。",
    sourceName: "笔记",
    content:
      "# 数据层\n\n- [x] 知识库目录\n- [x] 内容导入\n\n| 模块 | 状态 |\n| --- | --- |\n| API | `done` |",
  },
  {
    id: "note:2",
    kind: "note",
    title: "和阿杰聊产品的几个点",
    summary: "收藏箱、笔记和订阅不应该被迫迁移，知识库只是给项目语境建立一个轻量组织层。",
    sourceName: "笔记",
    content:
      "他说最怕的是又多一个入口，用户不知道该往哪放。结论是：知识库做组织，不抢内容源。",
  },
  {
    id: "note:3",
    kind: "note",
    title: "RSS 抓取去重策略草稿",
    summary: "先用 canonical URL 和 guid 做强去重，再用标题与发布时间窗口兜底。",
    sourceName: "笔记",
    content:
      "**目标** 是减少重复卡片，而不是追求理论上的完美去重。<br />保留原始 URL 方便回溯。",
  },
];

const SAMPLE_CLIPS: ImportCandidate[] = [
  {
    id: "clip:0",
    kind: "clip",
    title: "把信息管家做成陪伴：可爱的反义词不是严肃",
    summary: "为什么一个有性格的产品反而更容易被长期使用？",
    sourceName: "少数派",
    sourceUrl: "https://sspai.com/post/mewmo-product-companion",
    content:
      "长期使用的信息产品，需要在效率之外建立稳定的反馈节奏。陪伴感来自可预期的帮助，而不是装饰性的拟人。",
  },
  {
    id: "clip:1",
    kind: "clip",
    title: "Figma 如何做产品决策（设计负责人访谈）",
    summary: "从「先发散再收敛」到用原型代替评审文档，聊团队怎么把设计决策做轻。（视频转录摘要）",
    sourceName: "YouTube",
    sourceUrl: "https://www.youtube.com/watch?v=figma-product-decisions",
    content:
      "他们几乎不写长评审文档，而是直接做可点的原型让人体验，用真实反馈代替纸面辩论。\n\n决策权下放到最靠近问题的人，负责人只在方向和取舍上把关。",
  },
];

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
  const [notes, setNotes] = useState<ImportCandidate[]>(SAMPLE_NOTES);
  const [clips, setClips] = useState<ImportCandidate[]>(SAMPLE_CLIPS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(() => new Set());
  const [previewId, setPreviewId] = useState("note:0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    setPreviewId("note:0");
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
          data.length
            ? data.slice(0, 12).map((note) => ({
                id: `real-note:${note.id}`,
                kind: "note" as const,
                title: note.title,
                summary: note.summary || note.content || "笔记内容",
                sourceName: "笔记",
                noteId: note.id,
                content: note.content ?? "",
              }))
            : SAMPLE_NOTES,
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
          data.length
            ? data.slice(0, 12).map((clip) => ({
                id: `real-clip:${clip.id}`,
                kind: "clip" as const,
                title: clip.title,
                summary: clip.summary || clip.excerpt || clip.url,
                sourceName: clip.sourceName || domainFromUrl(clip.url),
                sourceUrl: clip.url,
                content: clip.content ?? "",
                clipId: clip.id,
              }))
            : SAMPLE_CLIPS,
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
  const previewParagraphs = preview
    ? formatKnowledgeImportPreviewParagraphs(preview.content, preview.sourceUrl)
    : [];

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
          const noteId = candidate.noteId ?? (await createSampleNote(candidate));
          items.push({ kind: "note", noteId });
        } else {
          const clipId = candidate.clipId ?? (await createSampleClip(candidate));
          items.push({ kind: "clip", clipId });
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

async function createSampleNote(candidate: ImportCandidate) {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: candidate.title,
      content: candidate.content ?? candidate.summary,
    }),
  });
  if (!response.ok) throw new Error("note");
  const note = (await response.json()) as { id: string };
  return note.id;
}

async function createSampleClip(candidate: ImportCandidate) {
  const candidateContent = candidate.content ?? candidate.summary;
  const response = await fetch("/api/clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: candidate.sourceUrl,
      title: candidate.title,
      summary: candidate.summary,
      content: candidateContent,
      sourceName: candidate.sourceName,
    }),
  });
  if (!response.ok) throw new Error("clip");
  const clip = (await response.json()) as {
    id: string;
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    sourceName?: string | null;
  };
  const shouldRestoreCandidate =
    clip.title !== candidate.title ||
    clip.summary !== candidate.summary ||
    clip.content !== candidateContent ||
    clip.sourceName !== candidate.sourceName;
  if (shouldRestoreCandidate) {
    const patch = await fetch(`/api/clips/${clip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: candidate.title,
        summary: candidate.summary,
        content: candidateContent,
        sourceName: candidate.sourceName,
      }),
    });
    if (!patch.ok) throw new Error("clip");
  }
  return clip.id;
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
