"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";

import {
  createVideo,
  createVideoHighlight,
  deleteVideo,
  deleteVideoHighlight,
  favoriteVideo,
  fetchGlobalTags,
  fetchVideoDetail,
  fetchVideoEntries,
  fetchVideoSources,
  markVideoRead,
  reanalyzeVideo,
  replaceVideoTags,
  type VideoTagRecord,
} from "../../lib/video-api";
import type {
  UserVideoHighlight,
  VideoDetail,
  VideoListItem,
  VideoProcessingStatus,
  VideoSource,
} from "../../lib/video-types";
import { useWorkspaceMemory } from "../../lib/workspace-memory";
import { noteTagPalette } from "../../lib/note-list-preview";
import { FloatingMenuButton, FloatingMenuLink, PopoverMenu } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { useAISidebarContext } from "../shell/AISidebar";
import { CardActionMenu } from "../shell/CardActionMenu";
import { ListColumn } from "../shell/ListColumn";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { ReaderBackToTopButton } from "../shell/ReaderBackToTopButton";
import { ReaderToolbar } from "../shell/ReaderToolbar";

type VideoTab = "transcript" | "highlights";
type HighlightFilter = "all" | "ai" | "user";
type AddMode = "video" | "channel";

interface SelectionToolbarState {
  text: string;
  startSeconds: number | null;
  left: number;
  top: number;
}

interface VideoSeekRequest {
  seconds: number;
  nonce: number;
}

const MEWMO_TAG_OPTIONS = ["读书", "设计", "产品", "数据层", "AI", "知识管理", "用户研究", "行业趋势"];
const MEWMO_TAG_COLORS = ["#4f93e8", "#e88478", "#4caf72", "#a874e0", "#e0a93a", "#4f9b91", "#d47a9b", "#6f8fc7"];

export function VideoWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { setContentContext, openSidebar } = useAISidebarContext();
  const listRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [details, setDetails] = useState<VideoDetail[]>([]);
  const [tagOptions, setTagOptions] = useState<VideoTagRecord[]>(
    MEWMO_TAG_OPTIONS.map((name) => ({ name, color: mewmoTagColor(name) })),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<VideoTab>("transcript");
  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [userHighlights, setUserHighlights] = useState<UserVideoHighlight[]>([]);
  const [seekRequest, setSeekRequest] = useState<VideoSeekRequest | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const pollingAttemptsRef = useRef(0);

  const feedId = searchParams.get("feedId");
  const entryId = searchParams.get("entryId");
  const addOpen = searchParams.get("add") === "1";
  const currentSource = sources.find((source) => source.id === feedId) ?? null;
  const workspaceHref = `${pathname}?${searchParams.toString()}`;

  const visibleVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return videos
      .filter((video) => !feedId || video.sourceId === feedId)
      .filter((video) => {
        if (!normalizedQuery) return true;
        return `${video.title} ${video.creatorName} ${video.preview} ${video.mewmoTags.join(" ")} ${video.summary ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => timestamp(right.publishedAt) - timestamp(left.publishedAt));
  }, [feedId, query, videos]);

  const selectedEntry =
    videos.find((video) => video.id === entryId) ??
    visibleVideos[0] ??
    null;
  const selectedVideo = details.find((video) => video.id === selectedEntry?.id) ?? null;

  const loadWorkspace = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextSources, nextVideos, nextTags] = await Promise.all([
        fetchVideoSources(),
        fetchVideoEntries(),
        fetchGlobalTags(),
      ]);
      setSources(nextSources);
      setVideos(nextVideos);
      setTagOptions((current) => mergeTagOptions(current, nextTags));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "视频数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const detail = await fetchVideoDetail(id);
    if (!detail) throw new Error("视频详情不存在");
    setDetails((current) => [detail, ...current.filter((item) => item.id !== id)]);
    setVideos((current) => current.map((item) => item.id === id ? toListItem(detail) : item));
    return detail;
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedEntry?.id) return;
    let cancelled = false;
    void loadDetail(selectedEntry.id).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "视频详情加载失败");
    });
    return () => {
      cancelled = true;
    };
  }, [loadDetail, selectedEntry?.id]);

  useEffect(() => {
    pollingAttemptsRef.current = 0;
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!selectedVideo || isTerminalStatus(selectedVideo.processingStatus) || pollingAttemptsRef.current >= 20) return;
    const timer = window.setTimeout(() => {
      pollingAttemptsRef.current += 1;
      void loadDetail(selectedVideo.id).catch(() => undefined);
    }, Math.min(10_000, 2_500 + pollingAttemptsRef.current * 500));
    return () => window.clearTimeout(timer);
  }, [loadDetail, selectedVideo]);

  useWorkspaceMemory({
    section: "feeds",
    href: workspaceHref,
    listRef,
    readerRef,
    restoreKey: selectedVideo?.id ?? "empty",
  });

  useEffect(() => {
    setActiveTab("transcript");
    setTranscriptQuery("");
    setUserHighlights(selectedVideo?.userHighlights ?? []);
    setSeekRequest(null);
  }, [selectedVideo?.id, selectedVideo?.userHighlights]);

  useEffect(() => {
    setCurrentTime(selectedVideo?.progressSeconds ?? 0);
  }, [selectedVideo?.id, selectedVideo?.progressSeconds]);

  const seekFromAI = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    setSeekRequest({ seconds, nonce: Date.now() });
  }, []);

  const openTranscriptFromAI = useCallback((seconds: number) => {
    setActiveTab("transcript");
    setTranscriptQuery("");
    setCurrentTime(seconds);
    setSeekRequest({ seconds, nonce: Date.now() });
  }, []);

  const addUserHighlight = useCallback(async (text: string, startSeconds: number | null) => {
    if (!selectedVideo) return;
    const optimistic: UserVideoHighlight = {
      id: `local-highlight-${Date.now()}`,
      text,
      startSeconds,
      createdAt: new Date().toISOString(),
    };
    setUserHighlights((current) => [optimistic, ...current]);
    try {
      const saved = await createVideoHighlight(selectedVideo.id, text, startSeconds);
      setUserHighlights((current) => current.map((item) => item.id === optimistic.id ? saved : item));
      showToast("已加入我的高光", "success");
    } catch (error) {
      setUserHighlights((current) => current.filter((item) => item.id !== optimistic.id));
      showToast(error instanceof Error ? error.message : "高光保存失败", "error");
    }
  }, [selectedVideo, showToast]);

  const deleteUserHighlight = useCallback(async (highlightId: string) => {
    if (!selectedVideo) return;
    const removed = userHighlights.find((item) => item.id === highlightId);
    setUserHighlights((current) => current.filter((item) => item.id !== highlightId));
    try {
      await deleteVideoHighlight(selectedVideo.id, highlightId);
    } catch (error) {
      if (removed) setUserHighlights((current) => [removed, ...current]);
      showToast(error instanceof Error ? error.message : "删除高光失败", "error");
    }
  }, [selectedVideo, showToast, userHighlights]);

  useEffect(() => {
    if (!selectedVideo) {
      setContentContext(null);
      return;
    }

    setContentContext({
      kind: "video",
      id: selectedVideo.id,
      title: selectedVideo.title,
      sourceLabel: selectedVideo.creatorName,
      summary: selectedVideo.summary,
      quickJudgment: selectedVideo.quickJudgment,
      chapters: selectedVideo.chapters,
      processingStatus: selectedVideo.processingStatus,
      onSeek: seekFromAI,
      onOpenTranscript: openTranscriptFromAI,
      onCreateHighlight: addUserHighlight,
    });

    return () => setContentContext(null);
  }, [addUserHighlight, openTranscriptFromAI, seekFromAI, selectedVideo, setContentContext]);

  useEffect(() => {
    if (!selectedVideo?.isUnread) return;
    setVideos((current) => current.map((video) => (video.id === selectedVideo.id ? { ...video, isUnread: false } : video)));
    setDetails((current) => current.map((video) => (video.id === selectedVideo.id ? { ...video, isUnread: false } : video)));
    setSources((current) => current.map((source) => (
      source.id === selectedVideo.sourceId
        ? { ...source, unreadCount: Math.max(0, source.unreadCount - 1) }
        : source
    )));
    void markVideoRead(selectedVideo.id).catch(() => {
      setVideos((current) => current.map((video) => (video.id === selectedVideo.id ? { ...video, isUnread: true } : video)));
      setDetails((current) => current.map((video) => (video.id === selectedVideo.id ? { ...video, isUnread: true } : video)));
    });
  }, [selectedVideo?.id, selectedVideo?.isUnread, selectedVideo?.sourceId]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("type", "video");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (loading || !feedId || sources.some((source) => source.id === feedId)) return;
    updateParams({ feedId: null, entryId: null });
  }, [feedId, loading, sources]);

  const selectVideo = (video: VideoListItem) => {
    updateParams({ feedId: video.sourceId, entryId: video.id, add: null });
  };

  const updateSelected = (update: (video: VideoDetail) => VideoDetail) => {
    if (!selectedVideo) return;
    const next = update(selectedVideo);
    setDetails((current) => current.map((video) => (video.id === next.id ? next : video)));
    setVideos((current) => current.map((video) => (video.id === next.id ? toListItem(next) : video)));
  };

  const favoriteVideoItem = async (video: VideoListItem) => {
    if (video.isFavorited) {
      showToast("该视频已经收藏到剪藏", "success");
      return;
    }
    setVideos((current) => current.map((item) => item.id === video.id ? { ...item, isFavorited: true } : item));
    setDetails((current) => current.map((item) => item.id === video.id ? { ...item, isFavorited: true } : item));
    try {
      await favoriteVideo(video.id);
      showToast("已收藏到剪藏", "success");
    } catch (error) {
      setVideos((current) => current.map((item) => item.id === video.id ? { ...item, isFavorited: false } : item));
      setDetails((current) => current.map((item) => item.id === video.id ? { ...item, isFavorited: false } : item));
      showToast(error instanceof Error ? error.message : "收藏失败", "error");
    }
  };

  const toggleFavorite = async () => {
    if (selectedVideo) await favoriteVideoItem(selectedVideo);
  };

  const copyVideoLink = (video: VideoListItem) => {
    void navigator.clipboard?.writeText(video.url);
    showToast("已复制视频链接", "success");
  };

  const deleteVideoItem = async (video: VideoListItem) => {
    try {
      await deleteVideo(video.id);
      const nextVideo = visibleVideos.find((item) => item.id !== video.id) ?? null;
      setVideos((current) => current.filter((item) => item.id !== video.id));
      setDetails((current) => current.filter((item) => item.id !== video.id));
      if (selectedEntry?.id === video.id) {
        updateParams({
          feedId: nextVideo?.sourceId ?? feedId,
          entryId: nextVideo?.id ?? null,
        });
      }
      showToast("已删除视频", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "视频删除失败", "error");
    }
  };

  const addVideoItem = async (mode: AddMode, value: string) => {
    if (mode === "channel") {
      showToast("频道订阅将在下一阶段开放，当前先支持单个 Bilibili 视频", "error");
      return false;
    }
    try {
      const created = await createVideo(value);
      await loadWorkspace();
      showToast("已加入视频处理队列", "success");
      updateParams({ feedId: created.entry.feedId, entryId: created.entry.id, add: null });
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "视频添加失败", "error");
      return false;
    }
  };

  const saveTags = async (tags: string[]) => {
    if (!selectedVideo) return;
    const previousTags = selectedVideo.mewmoTags;
    const previousColors = selectedVideo.mewmoTagColors ?? {};
    updateSelected((video) => ({ ...video, mewmoTags: tags }));
    try {
      const confirmed = await replaceVideoTags(
        selectedVideo.id,
        tags.map((name) => ({
          name,
          color: tagOptions.find((option) => option.name === name)?.color ?? previousColors[name] ?? mewmoTagColor(name),
        })),
      );
      const colors = Object.fromEntries(confirmed.flatMap((tag) => tag.color ? [[tag.name, tag.color]] : []));
      updateSelected((video) => ({
        ...video,
        mewmoTags: confirmed.map((tag) => tag.name),
        mewmoTagColors: colors,
      }));
      setTagOptions((current) => mergeTagOptions(current, confirmed));
    } catch (error) {
      updateSelected((video) => ({ ...video, mewmoTags: previousTags, mewmoTagColors: previousColors }));
      showToast(error instanceof Error ? error.message : "标签保存失败", "error");
    }
  };

  const reanalyzeVideoItem = async (video: VideoListItem) => {
    setVideos((current) => current.map((item) => item.id === video.id
      ? { ...item, processingStatus: "fetching_metadata", summary: null }
      : item));
    setDetails((current) => current.map((item) => item.id === video.id ? {
      ...item,
      processingStatus: "fetching_metadata",
      summary: null,
      quickJudgment: null,
      keyPoints: [],
      targetAudience: null,
      chapters: [],
      highlights: [],
      transcript: [],
    } : item));
    if (selectedEntry?.id === video.id) pollingAttemptsRef.current = 0;
    try {
      await reanalyzeVideo(video.id);
      showToast("已重新开始分析", "success");
    } catch (error) {
      if (selectedEntry?.id === video.id) await loadDetail(video.id).catch(() => undefined);
      else await loadWorkspace();
      showToast(error instanceof Error ? error.message : "重新分析失败", "error");
    }
  };

  const handleReanalyze = async () => {
    if (selectedVideo) await reanalyzeVideoItem(selectedVideo);
  };

  const quickSwitch = (
    <>
      <FloatingMenuLink href="/feeds?type=article" icon="doc" scroll={false}>文章</FloatingMenuLink>
      <FloatingMenuLink href="/feeds?type=media" icon="media" scroll={false}>媒体</FloatingMenuLink>
      <FloatingMenuButton icon="mic" onClick={() => showToast("播客订阅还在路上", "error")}>播客</FloatingMenuButton>
    </>
  );

  return (
    <div className={`mewmo-workspace mewmo-video-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}>
      <ListColumn
        title={currentSource?.title ?? "视频"}
        bodyRef={listRef}
        quickSwitch={quickSwitch}
        searchPlaceholder="搜索视频..."
        onSearchChange={setQuery}
        action={
          <button type="button" className="mewmo-icon-button" onClick={() => updateParams({ add: "1" })} aria-label="添加视频">
            <PrototypeIcon name="plus" size={17} />
          </button>
        }
      >
        <div className="mewmo-list-stack mewmo-video-list">
          {loadError && (
            <div className="mewmo-video-prototype-note">
              <PrototypeIcon name="info" size={14} />
              <span>{loadError}</span>
              <button type="button" onClick={() => void loadWorkspace()}>重试</button>
            </div>
          )}
          {loading ? (
            <div className="mewmo-feed-placeholder">
              <PrototypeIcon name="sync" size={32} />
              <span>正在加载视频...</span>
            </div>
          ) : visibleVideos.length === 0 ? (
            <div className="mewmo-feed-placeholder">
              <PrototypeIcon name="video" size={40} />
              <span>{feedId ? "这个频道还没有视频" : "还没有视频内容"}</span>
              <p>添加单个视频或订阅频道后，新内容会显示在这里。</p>
            </div>
          ) : (
            visibleVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                selected={selectedVideo?.id === video.id}
                onSelect={() => selectVideo(video)}
                onDelete={() => void deleteVideoItem(video)}
                onFavorite={() => void favoriteVideoItem(video)}
                onReanalyze={() => void reanalyzeVideoItem(video)}
                onCopyLink={() => copyVideoLink(video)}
              />
            ))
          )}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedVideo?.title ?? currentSource?.title ?? "视频"}
          onToggleList={() => setListCollapsed((value) => !value)}
          listCollapsed={listCollapsed}
          menuKind="video"
          favoriteActive={Boolean(selectedVideo?.isFavorited)}
          onFavorite={() => void toggleFavorite()}
          onAddToKnowledge={() => showToast("加入知识库将在下一阶段接入", "success")}
          onCopyContent={() => {
            if (!selectedVideo) return;
            const content = [selectedVideo.title, selectedVideo.description, ...selectedVideo.transcript.map((item) => item.text)].filter(Boolean).join("\n\n");
            void navigator.clipboard?.writeText(content);
            showToast("已复制当前内容", "success");
          }}
          onExport={() => showToast("视频导出功能即将开放", "success")}
          onReanalyze={() => void handleReanalyze()}
          onCopyLink={() => {
            if (!selectedVideo) return;
            copyVideoLink(selectedVideo);
          }}
        />
        <div ref={readerRef} className="mewmo-reader-scroll">
          {selectedVideo ? (
            <VideoReader
              video={selectedVideo}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              currentTime={currentTime}
              onCurrentTimeChange={setCurrentTime}
              transcriptQuery={transcriptQuery}
              onTranscriptQueryChange={setTranscriptQuery}
              userHighlights={userHighlights}
              onAddUserHighlight={addUserHighlight}
              onDeleteUserHighlight={deleteUserHighlight}
              seekRequest={seekRequest}
              onOpenAI={() => openSidebar("summary")}
              availableTags={tagOptions}
              onTagsChange={(tags) => void saveTags(tags)}
              onAction={(message) => showToast(message, "success")}
            />
          ) : (
            <article className="mewmo-document mewmo-document--empty">
              <h1>选择一个视频</h1>
              <p>从左侧列表选择视频，查看原文、高光笔记和右侧 AI 解读。</p>
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={readerRef} visible={false} />
      </section>

      <AddVideoModal
        open={addOpen}
        onClose={() => updateParams({ add: null })}
        onAdd={addVideoItem}
      />
    </div>
  );
}

function VideoCard({
  video,
  selected,
  onSelect,
  onDelete,
  onFavorite,
  onReanalyze,
  onCopyLink,
}: {
  video: VideoListItem;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onReanalyze: () => void;
  onCopyLink: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className={`mewmo-list-card-wrap ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}>
      <button
        type="button"
        className={`mewmo-list-card mewmo-list-card--button mewmo-video-card ${selected ? "mewmo-list-card--selected" : ""}`}
        onClick={onSelect}
      >
        <div className="mewmo-list-card__title">
          {video.isUnread && <i className="mewmo-unread-dot" />}
          <span>{video.title}</span>
        </div>
        <p>{video.preview}</p>
        <div className="mewmo-list-card__cover mewmo-video-card__cover" aria-hidden="true">
          {video.coverImage ? (
            <img src={video.coverImage} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="mewmo-video-card__cover-empty"><PrototypeIcon name="video" size={24} /></span>
          )}
          {video.durationSeconds !== null && <span>{formatDuration(video.durationSeconds)}</span>}
        </div>
        <div className="mewmo-list-card__source mewmo-list-card__source--clip">
          <span className={`mewmo-favicon mewmo-video-platform mewmo-video-platform--${video.platform}`}>
            {video.platform === "bilibili" ? "B" : "Y"}
          </span>
          <span>{video.creatorName}</span>
          <time>{formatDate(video.publishedAt)}</time>
        </div>
        {video.isFavorited && <PrototypeIcon name="bookmark" size={14} className="mewmo-video-card__bookmark" />}
      </button>
      <CardActionMenu
        kind="video"
        open={menuOpen}
        ariaLabel="视频操作"
        favoriteActive={video.isFavorited}
        onOpenChange={setMenuOpen}
        onDelete={onDelete}
        onFavorite={onFavorite}
        onReanalyze={onReanalyze}
        onCopyLink={onCopyLink}
        href={video.url}
      />
    </article>
  );
}

function VideoReader({
  video,
  activeTab,
  onTabChange,
  currentTime,
  onCurrentTimeChange,
  transcriptQuery,
  onTranscriptQueryChange,
  userHighlights,
  onAddUserHighlight,
  onDeleteUserHighlight,
  seekRequest,
  onOpenAI,
  availableTags,
  onTagsChange,
  onAction,
}: {
  video: VideoDetail;
  activeTab: VideoTab;
  onTabChange: (tab: VideoTab) => void;
  currentTime: number;
  onCurrentTimeChange: (value: number) => void;
  transcriptQuery: string;
  onTranscriptQueryChange: (value: string) => void;
  userHighlights: UserVideoHighlight[];
  onAddUserHighlight: (text: string, startSeconds: number | null) => void;
  onDeleteUserHighlight: (highlightId: string) => void;
  seekRequest: VideoSeekRequest | null;
  onOpenAI: () => void;
  availableTags: VideoTagRecord[];
  onTagsChange: (tags: string[]) => void;
  onAction: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("all");
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const normalizedQuery = transcriptQuery.trim().toLowerCase();
  const visibleTranscript = video.transcript.filter((segment) =>
    normalizedQuery ? segment.text.toLowerCase().includes(normalizedQuery) : true,
  );
  useEffect(() => {
    setHighlightFilter("all");
    setSelectionToolbar(null);
  }, [video.id]);

  useEffect(() => {
    if (!seekRequest) return;
    const player = videoRef.current;
    if (player) {
      player.currentTime = seekRequest.seconds;
      void player.play().catch(() => undefined);
    }
    onCurrentTimeChange(seekRequest.seconds);
  }, [onCurrentTimeChange, seekRequest]);

  const seekTo = (seconds: number) => {
    const player = videoRef.current;
    if (player) {
      player.currentTime = seconds;
      void player.play().catch(() => undefined);
    }
    onCurrentTimeChange(seconds);
  };

  const handleTextSelection = (event: ReactMouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !text) {
      setSelectionToolbar(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!event.currentTarget.contains(range.commonAncestorContainer)) {
      setSelectionToolbar(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const selectedElement = range.startContainer.parentElement;
    const startValue = selectedElement?.closest<HTMLElement>("[data-video-start]")?.dataset.videoStart;
    const startSeconds = startValue === undefined ? null : Number(startValue);
    setSelectionToolbar({
      text,
      startSeconds: Number.isFinite(startSeconds) ? startSeconds : null,
      left: Math.min(window.innerWidth - 164, Math.max(12, rect.left + rect.width / 2 - 82)),
      top: Math.max(12, rect.top - 52),
    });
  };

  const saveSelectionAsHighlight = () => {
    if (!selectionToolbar) return;
    onAddUserHighlight(selectionToolbar.text, selectionToolbar.startSeconds);
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
  };

  return (
    <article className="mewmo-document mewmo-video-reader">
      <div className="mewmo-video-reader__head">
        <div>
          <h1>{video.title}</h1>
          <div className="mewmo-doc-meta">
            <span className={`mewmo-video-source-badge mewmo-video-source-badge--${video.platform}`}>{video.platform === "bilibili" ? "Bilibili" : "YouTube"}</span>
            <span>{video.creatorName}</span><span><b>·</b>{formatDate(video.publishedAt)}</span>
            {video.durationSeconds !== null && <span><b>·</b>{formatDuration(video.durationSeconds)}</span>}
          </div>
        </div>
      </div>

      <div className="mewmo-video-player">
        {video.mockVideoUrl ? (
          <video
            key={video.id}
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            poster={video.coverImage ?? undefined}
            src={video.mockVideoUrl}
            onLoadedMetadata={(event) => {
              const player = event.currentTarget;
              player.currentTime = Math.min(video.progressSeconds, player.duration || video.progressSeconds);
            }}
            onTimeUpdate={(event) => onCurrentTimeChange(event.currentTarget.currentTime)}
          />
        ) : video.embedUrl ? (
          <iframe
            key={`${video.id}-${seekRequest?.nonce ?? 0}`}
            src={withEmbedStart(video.embedUrl, seekRequest?.seconds ?? currentTime)}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="mewmo-video-player__empty">
            <PrototypeIcon name="video" size={30} />
            <span>播放器暂不可用，可前往原平台观看。</span>
          </div>
        )}
      </div>

      <section className="mewmo-video-description">
        <header>
          <div><PrototypeIcon name="doc" size={14} /><strong>原视频简介</strong><span>来自 {video.platform === "bilibili" ? "Bilibili" : "YouTube"}</span></div>
          <a href={video.url} target="_blank" rel="noreferrer">查看原视频<PrototypeIcon name="external" size={13} /></a>
        </header>
        <p>{video.description || video.preview}</p>
      </section>

      <VideoTagManager
        tags={video.mewmoTags}
        tagColors={video.mewmoTagColors ?? {}}
        availableTags={availableTags}
        suggestions={video.suggestedTags}
        onTagsChange={onTagsChange}
        onFeedback={onAction}
      />

      <button type="button" className="mewmo-video-ai-teaser" onClick={onOpenAI}>
        <span className="mewmo-video-ai-teaser__icon"><PrototypeIcon name="spark" size={17} /></span>
        <span>
          <strong>{analysisStatusTitle(video.processingStatus)}</strong>
          <small>{video.quickJudgment?.summary ?? statusDescription(video.processingStatus)}</small>
        </span>
        <span>在右侧查看<PrototypeIcon name="chev-right" size={14} /></span>
      </button>

      <div className="mewmo-video-tabs" role="tablist" aria-label="视频内容">
        {(["transcript", "highlights"] as VideoTab[]).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>
            {tab === "transcript" ? "原文细读" : `高光笔记 ${video.highlights.length + userHighlights.length || ""}`}
          </button>
        ))}
      </div>

      {activeTab === "highlights" && (
        <section className="mewmo-video-panel">
          <div className="mewmo-video-highlight-head">
            <div><strong>高光笔记</strong><span>AI 提炼与我的摘录分开保存</span></div>
            <div className="mewmo-video-highlight-filters">
              {(["all", "ai", "user"] as HighlightFilter[]).map((filter) => <button type="button" key={filter} className={highlightFilter === filter ? "active" : ""} onClick={() => setHighlightFilter(filter)}>{filter === "all" ? "全部" : filter === "ai" ? "AI 高光" : "我的高光"}</button>)}
            </div>
          </div>
          {(highlightFilter === "all" || highlightFilter === "ai") && video.highlights.length > 0 && (
            <div className="mewmo-video-highlight-group">
              <h2><span>AI</span>AI 高光</h2>
              <div className="mewmo-video-highlights">
                {video.highlights.map((highlight) => (
                  <article key={highlight.id} className="mewmo-video-highlight-card--ai">
                    <button type="button" onClick={() => seekTo(highlight.startSeconds)}>{formatDuration(highlight.startSeconds)}</button>
                    <div><span className="mewmo-video-highlight-source">AI 提炼{highlight.score ? ` · 重要度 ${highlight.score}` : ""}</span><strong>{highlight.title}</strong><p>{highlight.note}</p></div>
                    <button type="button" className="mewmo-icon-button" onClick={() => onAction("已复制高光笔记")} aria-label="复制高光"><PrototypeIcon name="copy-plain" size={14} /></button>
                  </article>
                ))}
              </div>
            </div>
          )}
          {(highlightFilter === "all" || highlightFilter === "user") && (
            <div className="mewmo-video-highlight-group">
              <h2><span>我</span>我的高光</h2>
              {userHighlights.length > 0 ? <div className="mewmo-video-highlights">
                {userHighlights.map((highlight) => (
                  <article key={highlight.id} className="mewmo-video-highlight-card--user">
                    {highlight.startSeconds !== null ? <button type="button" onClick={() => seekTo(highlight.startSeconds!)}>{formatDuration(highlight.startSeconds)}</button> : <span />}
                    <div><span className="mewmo-video-highlight-source">我选择的高光 · {highlight.text.length} 字</span><p>{highlight.text}</p></div>
                    <button type="button" className="mewmo-icon-button" onClick={() => onDeleteUserHighlight(highlight.id)} aria-label="删除高光"><PrototypeIcon name="close" size={14} /></button>
                  </article>
                ))}
              </div> : <div className="mewmo-video-highlight-empty">在右侧 AI 解读或「原文细读」中选中文字，即可一键加入这里。</div>}
            </div>
          )}
          {highlightFilter === "ai" && video.highlights.length === 0 && <VideoUnavailable status={video.processingStatus} label="AI 高光" />}
        </section>
      )}

      {activeTab === "transcript" && (
        <section className="mewmo-video-panel mewmo-video-selectable" onMouseUp={handleTextSelection}>
          <label className="mewmo-video-transcript-search">
            <PrototypeIcon name="search" size={15} />
            <input value={transcriptQuery} onChange={(event) => onTranscriptQueryChange(event.target.value)} placeholder="搜索字幕..." />
          </label>
          {visibleTranscript.length > 0 ? (
            <div className="mewmo-video-transcript">
              {visibleTranscript.map((segment) => {
                const current = currentTime >= segment.startSeconds && currentTime < segment.endSeconds;
                return (
                  <article key={segment.id} className={current ? "active" : ""} data-video-start={segment.startSeconds}>
                    <button type="button" onClick={() => seekTo(segment.startSeconds)}><time>{formatDuration(segment.startSeconds)}</time></button><span>{highlightText(segment.text, transcriptQuery)}</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <VideoUnavailable status={video.processingStatus} label={transcriptQuery ? "匹配字幕" : "字幕"} />
          )}
        </section>
      )}

      {selectionToolbar && (
        <div className="mewmo-video-selection-toolbar" style={{ left: selectionToolbar.left, top: selectionToolbar.top }}>
          <span>{selectionToolbar.text.length} 字</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={saveSelectionAsHighlight}>高光</button>
        </div>
      )}
    </article>
  );
}

function VideoTagManager({
  tags,
  tagColors,
  availableTags,
  suggestions,
  onTagsChange,
  onFeedback,
}: {
  tags: string[];
  tagColors: Record<string, string>;
  availableTags: VideoTagRecord[];
  suggestions: string[];
  onTagsChange: (tags: string[]) => void;
  onFeedback: (message: string) => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const options = useMemo(
    () => [...new Set([...availableTags.map((tag) => tag.name), ...MEWMO_TAG_OPTIONS, ...tags, ...suggestions])]
      .filter((tag) => !normalizedSearch || tag.toLowerCase().includes(normalizedSearch)),
    [availableTags, normalizedSearch, suggestions, tags],
  );
  const pendingSuggestions = suggestions.filter((tag) => !tags.includes(tag));

  const toggleTag = (tag: string, source: "picker" | "suggestion" | "create" = "picker") => {
    const exists = tags.includes(tag);
    onTagsChange(exists ? tags.filter((item) => item !== tag) : [...tags, tag]);
    if (source === "suggestion") onFeedback(`已确认 AI 建议标签「${tag}」`);
    else if (source === "create") onFeedback(`已创建并添加标签「${tag}」`);
    else onFeedback(exists ? `已移除标签「${tag}」` : `已添加标签「${tag}」`);
  };

  const createTag = () => {
    const tag = search.trim();
    if (!tag) return;
    if (!tags.includes(tag)) toggleTag(tag, "create");
    setSearch("");
    setOpen(false);
  };

  return (
    <section className="mewmo-video-mewmo-tags">
      <header>
        <div><PrototypeIcon name="tag" size={14} /><strong>Mewmo 标签</strong><span>跨笔记、剪藏与订阅统一组织</span></div>
        <span ref={anchorRef}>
          <button type="button" className="mewmo-video-mewmo-tags__add" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <PrototypeIcon name="plus" size={13} />标签
          </button>
        </span>
      </header>

      <div className="mewmo-video-mewmo-tags__confirmed">
        {tags.length > 0 ? tags.map((tag) => (
          <button
            type="button"
            key={tag}
            style={{ "--tc": tagColors[tag] ?? availableTags.find((option) => option.name === tag)?.color ?? mewmoTagColor(tag) } as CSSProperties}
            onClick={() => setOpen(true)}
            title={`管理标签：${tag}`}
          >
            {tag}
          </button>
        )) : <span>还没有标签，可手动选择或确认 AI 建议。</span>}
      </div>

      {pendingSuggestions.length > 0 && (
        <div className="mewmo-video-mewmo-tags__suggestions">
          <span><PrototypeIcon name="spark" size={13} />AI 建议 · 确认后加入</span>
          <div>
            {pendingSuggestions.map((tag) => (
              <button type="button" key={tag} onClick={() => toggleTag(tag, "suggestion")}>
                <PrototypeIcon name="plus" size={11} />{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <PopoverMenu
        open={open}
        anchorRef={anchorRef}
        onOpenChange={setOpen}
        align="end"
        gap={5}
        boundary="main"
        className="mewmo-tag-picker mewmo-video-tag-picker"
      >
        <div className="mewmo-tag-picker__search">
          <PrototypeIcon name="search" size={14} />
          <input
            value={search}
            placeholder="搜索或创建标签..."
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createTag();
              if (event.key === "Escape") setOpen(false);
            }}
          />
        </div>
        <div className="mewmo-tag-picker__list">
          {options.map((tag) => {
            const checked = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`mewmo-tag-picker__item ${checked ? "mewmo-tag-picker__item--checked" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                <span className="mewmo-tag-picker__dot" style={{ "--tc": tagColors[tag] ?? availableTags.find((option) => option.name === tag)?.color ?? mewmoTagColor(tag) } as CSSProperties} />
                <span>{tag}</span>
                {checked && <span className="mewmo-tag-picker__check"><PrototypeIcon name="check" size={14} /></span>}
              </button>
            );
          })}
        </div>
        {search.trim() && ![...availableTags.map((tag) => tag.name), ...MEWMO_TAG_OPTIONS, ...tags, ...suggestions].some((tag) => tag.toLowerCase() === normalizedSearch) && (
          <button type="button" className="mewmo-tag-picker__create" onClick={createTag}>
            <PrototypeIcon name="plus" size={14} />
            <span>新建「{search.trim()}」</span>
          </button>
        )}
      </PopoverMenu>
    </section>
  );
}

function AddVideoModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (mode: AddMode, value: string) => Promise<boolean> }) {
  const [mode, setMode] = useState<AddMode>("video");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    const added = await onAdd(mode, value.trim());
    if (added) setValue("");
    setSubmitting(false);
  };

  return (
    <div className="mewmo-feed-modal" data-state="open" role="dialog" aria-modal="true" aria-labelledby="mewmo-addvideo-title">
      <button type="button" className="mewmo-feed-modal__scrim" aria-label="关闭添加视频" onClick={onClose} />
      <div className="mewmo-feed-modal__panel mewmo-video-add-modal">
        <div className="addfeed__head"><h2 id="mewmo-addvideo-title">添加视频</h2><button type="button" className="mewmo-icon-button" onClick={onClose} aria-label="关闭"><PrototypeIcon name="close" size={19} /></button></div>
        <div className="mewmo-video-add-tabs">
          <button type="button" className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}>单个视频</button>
          <button type="button" className={mode === "channel" ? "active" : ""} onClick={() => setMode("channel")}>订阅频道</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="mewmo-video-add-field">
            <span>{mode === "video" ? "视频链接" : "频道或 UP 主链接"}</span>
            <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === "video" ? "粘贴 Bilibili 视频链接" : "粘贴频道主页链接"} disabled={submitting} />
          </label>
          <div className="mewmo-video-add-support"><span>Bilibili</span><small>当前先支持单个视频；YouTube 与频道订阅将在后续开放</small></div>
          <div className="addfeed__actions"><button type="button" className="mewmo-button mewmo-button--ghost" onClick={onClose} disabled={submitting}>取消</button><button type="submit" className="mewmo-button mewmo-button--primary" disabled={!value.trim() || submitting}>{submitting ? "正在添加..." : mode === "video" ? "添加并分析" : "订阅频道"}</button></div>
        </form>
      </div>
    </div>
  );
}

function VideoUnavailable({ status, label }: { status: VideoProcessingStatus; label: string }) {
  return <div className="mewmo-video-unavailable"><PrototypeIcon name={status === "failed" ? "empty" : "sync"} size={24} /><strong>{label}暂不可用</strong><span>{statusDescription(status)}</span></div>;
}

function statusDescription(status: VideoProcessingStatus) {
  if (status === "fetching_metadata") return "正在获取标题、封面和时长。";
  if (status === "fetching_transcript") return "视频信息已就绪，正在获取字幕。";
  if (status === "analyzing") return "字幕已获取，AI 正在生成摘要和章节。";
  if (status === "no_transcript") return "平台没有提供可用字幕，暂时无法生成章节。";
  if (status === "failed") return "处理失败，可以稍后重新分析。";
  return "视频内容已经完成分析。";
}

function analysisStatusTitle(status: VideoProcessingStatus) {
  if (status === "ready") return "AI 解读已生成";
  if (status === "no_transcript") return "AI 解读暂不可用";
  if (status === "failed") return "AI 解读失败";
  return "AI 正在解读这条视频";
}

function formatDuration(value: number) {
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "时间未知";
  return new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toListItem({
  description: _description,
  suggestedTags: _suggestedTags,
  quickJudgment: _quickJudgment,
  keyPoints: _keyPoints,
  targetAudience: _targetAudience,
  chapters: _chapters,
  transcript: _transcript,
  highlights: _highlights,
  visualSummary: _visualSummary,
  userHighlights: _userHighlights,
  ...item
}: VideoDetail): VideoListItem {
  return item;
}

function mewmoTagColor(tag: string) {
  const known = noteTagPalette[tag];
  if (known) return known;
  const hash = [...tag].reduce((value, character) => value + character.charCodeAt(0), 0);
  return MEWMO_TAG_COLORS[hash % MEWMO_TAG_COLORS.length]!;
}

function mergeTagOptions(current: VideoTagRecord[], incoming: VideoTagRecord[]) {
  const merged = new Map(current.map((tag) => [tag.name, tag]));
  for (const tag of incoming) {
    const existing = merged.get(tag.name);
    merged.set(tag.name, {
      ...existing,
      ...tag,
      color: tag.color ?? existing?.color ?? mewmoTagColor(tag.name),
    });
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function isTerminalStatus(status: VideoProcessingStatus) {
  return status === "ready" || status === "no_transcript" || status === "failed";
}

function withEmbedStart(embedUrl: string, seconds: number) {
  try {
    const url = new URL(embedUrl);
    const start = Math.max(0, Math.round(seconds));
    if (url.hostname.includes("bilibili.com")) url.searchParams.set("t", String(start));
    if (url.hostname.includes("youtube.com")) url.searchParams.set("start", String(start));
    return url.toString();
  } catch {
    return embedUrl;
  }
}

function highlightText(text: string, query: string) {
  const value = query.trim();
  if (!value) return text;
  const index = text.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + value.length)}</mark>{text.slice(index + value.length)}</>;
}
