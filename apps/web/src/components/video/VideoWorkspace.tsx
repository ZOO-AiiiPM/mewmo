"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";

import { mockVideoDetails, mockVideoList, mockVideoSources } from "../../lib/video-mock-data";
import type {
  VideoDetail,
  VideoListItem,
  VideoProcessingStatus,
  VideoSource,
  VideoWatchStatus,
} from "../../lib/video-types";
import { useWorkspaceMemory } from "../../lib/workspace-memory";
import { FloatingMenuButton, FloatingMenuLink } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { ListColumn } from "../shell/ListColumn";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { ReaderBackToTopButton } from "../shell/ReaderBackToTopButton";
import { ReaderToolbar } from "../shell/ReaderToolbar";

type VideoTab = "summary" | "transcript" | "highlights";
type SummaryMode = "timeline" | "theme";
type HighlightFilter = "all" | "ai" | "user";
type AddMode = "video" | "channel";

interface UserVideoHighlight {
  id: string;
  text: string;
  startSeconds: number | null;
  createdAt: string;
}

interface SelectionToolbarState {
  text: string;
  startSeconds: number | null;
  left: number;
  top: number;
}

const statusCopy: Record<VideoProcessingStatus, string> = {
  fetching_metadata: "获取信息中",
  fetching_transcript: "获取字幕中",
  analyzing: "AI 分析中",
  ready: "分析完成",
  no_transcript: "暂无字幕",
  failed: "处理失败",
};

const watchCopy: Record<VideoWatchStatus, string> = {
  unwatched: "未看",
  watching: "观看中",
  watched: "已看",
};

export function VideoWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<VideoSource[]>(mockVideoSources);
  const [videos, setVideos] = useState<VideoListItem[]>(mockVideoList);
  const [details, setDetails] = useState<VideoDetail[]>(mockVideoDetails);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<VideoTab>("summary");
  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptQuery, setTranscriptQuery] = useState("");

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
        return `${video.title} ${video.creatorName} ${video.summary ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => timestamp(right.publishedAt) - timestamp(left.publishedAt));
  }, [feedId, query, videos]);

  const selectedVideo =
    details.find((video) => video.id === entryId) ??
    details.find((video) => video.id === visibleVideos[0]?.id) ??
    null;

  useWorkspaceMemory({
    section: "feeds",
    href: workspaceHref,
    listRef,
    readerRef,
    restoreKey: selectedVideo?.id ?? "empty",
  });

  useEffect(() => {
    setActiveTab("summary");
    setTranscriptQuery("");
    setCurrentTime(selectedVideo?.progressSeconds ?? 0);
  }, [selectedVideo?.id, selectedVideo?.progressSeconds]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("type", "video");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const selectVideo = (video: VideoListItem) => {
    updateParams({ feedId: video.sourceId, entryId: video.id, add: null });
  };

  const updateSelected = (update: (video: VideoDetail) => VideoDetail) => {
    if (!selectedVideo) return;
    const next = update(selectedVideo);
    setDetails((current) => current.map((video) => (video.id === next.id ? next : video)));
    setVideos((current) => current.map((video) => (video.id === next.id ? toListItem(next) : video)));
  };

  const toggleFavorite = () => {
    if (!selectedVideo) return;
    const nextValue = !selectedVideo.isFavorited;
    updateSelected((video) => ({ ...video, isFavorited: nextValue }));
    showToast(nextValue ? "已收藏视频（前端原型）" : "已取消收藏（前端原型）", "success");
  };

  const markWatched = () => {
    if (!selectedVideo) return;
    const watched = selectedVideo.watchStatus !== "watched";
    updateSelected((video) => ({
      ...video,
      watchStatus: watched ? "watched" : "unwatched",
      progressSeconds: watched ? video.durationSeconds ?? 0 : 0,
    }));
    setCurrentTime(watched ? selectedVideo.durationSeconds ?? 0 : 0);
    showToast(watched ? "已标记为看完" : "已标记为未看", "success");
  };

  const addPrototypeItem = (mode: AddMode, value: string) => {
    if (mode === "channel") {
      const source: VideoSource = {
        id: `video-source-${Date.now()}`,
        title: "新订阅频道",
        url: value,
        type: "video",
        platform: value.includes("youtube") ? "youtube" : "bilibili",
        favicon: null,
        unreadCount: 0,
        lastFetchedAt: null,
      };
      setSources((current) => [source, ...current]);
      showToast("已添加频道（前端原型）", "success");
      updateParams({ feedId: source.id, entryId: null, add: null });
      return;
    }

    const source = sources[0] ?? mockVideoSources[0]!;
    const id = `video-entry-${Date.now()}`;
    const detail: VideoDetail = {
      id,
      sourceId: source.id,
      platform: value.includes("youtube") ? "youtube" : "bilibili",
      title: "刚刚添加的视频",
      url: value,
      creatorName: source.title,
      durationSeconds: null,
      publishedAt: new Date().toISOString(),
      summary: null,
      processingStatus: "fetching_metadata",
      watchStatus: "unwatched",
      progressSeconds: 0,
      isFavorited: false,
      coverImage: "https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
      mockVideoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      quickJudgment: null,
      keyPoints: [],
      targetAudience: null,
      chapters: [],
      transcript: [],
      highlights: [],
      visualSummary: [],
    };
    setDetails((current) => [detail, ...current]);
    setVideos((current) => [toListItem(detail), ...current]);
    showToast("已加入处理队列（前端原型）", "success");
    updateParams({ feedId: source.id, entryId: id, add: null });
  };

  const quickSwitch = (
    <>
      <FloatingMenuLink href="/feeds?type=article" icon="doc" scroll={false}>文章</FloatingMenuLink>
      <FloatingMenuLink href="/feeds?type=media" icon="media" scroll={false}>媒体</FloatingMenuLink>
      <FloatingMenuButton icon="mic" onClick={() => showToast("播客订阅还在路上", "error")}>播客</FloatingMenuButton>
    </>
  );

  return (
    <div className="mewmo-workspace mewmo-video-workspace">
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
          <div className="mewmo-video-prototype-note">
            <PrototypeIcon name="info" size={14} />
            <span>当前为前端原型，视频识别和 AI 处理尚未连接后端。</span>
          </div>
          {visibleVideos.length === 0 ? (
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
              />
            ))
          )}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedVideo?.title ?? currentSource?.title ?? "视频"}
          menuKind="feed"
          favoriteActive={Boolean(selectedVideo?.isFavorited)}
          onFavorite={toggleFavorite}
          onCopyLink={() => {
            if (!selectedVideo) return;
            void navigator.clipboard?.writeText(selectedVideo.url);
            showToast("已复制视频链接", "success");
          }}
          actions={
            selectedVideo ? (
              <button type="button" className="mewmo-icon-button" onClick={() => showToast("加入知识库将在后端阶段接入", "success")} aria-label="加入知识库">
                <PrototypeIcon name="library" size={19} />
              </button>
            ) : null
          }
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
              onToggleWatched={markWatched}
              onPrototypeAction={(message) => showToast(`${message}（前端原型）`, "success")}
            />
          ) : (
            <article className="mewmo-document mewmo-document--empty">
              <h1>选择一个视频</h1>
              <p>从左侧列表选择视频，查看全文总结、原文和高光笔记。</p>
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={readerRef} visible={false} />
      </section>

      <AddVideoModal
        open={addOpen}
        onClose={() => updateParams({ add: null })}
        onAdd={addPrototypeItem}
      />
    </div>
  );
}

function VideoCard({ video, selected, onSelect }: { video: VideoListItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`mewmo-list-card mewmo-list-card--button mewmo-video-card ${selected ? "mewmo-list-card--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="mewmo-list-card__title">
        {video.watchStatus === "unwatched" && <i className="mewmo-unread-dot" />}
        <span>{video.title}</span>
      </div>
      <p>{video.summary || statusDescription(video.processingStatus)}</p>
      <div className="mewmo-list-card__cover mewmo-video-card__cover" aria-hidden="true">
        <img src={video.coverImage} alt="" referrerPolicy="no-referrer" />
        {video.durationSeconds !== null && <span>{formatDuration(video.durationSeconds)}</span>}
      </div>
      <div className="mewmo-list-card__source mewmo-list-card__source--clip">
        <span className={`mewmo-favicon mewmo-video-platform mewmo-video-platform--${video.platform}`}>
          {video.platform === "bilibili" ? "B" : "Y"}
        </span>
        <span>{video.creatorName}</span>
        <time>{formatDate(video.publishedAt)}</time>
      </div>
      <div className="mewmo-video-card__badges">
        <span className={`mewmo-video-status mewmo-video-status--${video.processingStatus}`}>{statusCopy[video.processingStatus]}</span>
        <span>{watchCopy[video.watchStatus]}</span>
      </div>
      {video.isFavorited && <PrototypeIcon name="bookmark" size={14} className="mewmo-video-card__bookmark" />}
    </button>
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
  onToggleWatched,
  onPrototypeAction,
}: {
  video: VideoDetail;
  activeTab: VideoTab;
  onTabChange: (tab: VideoTab) => void;
  currentTime: number;
  onCurrentTimeChange: (value: number) => void;
  transcriptQuery: string;
  onTranscriptQueryChange: (value: string) => void;
  onToggleWatched: () => void;
  onPrototypeAction: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [quickJudgmentOpen, setQuickJudgmentOpen] = useState(true);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("timeline");
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("all");
  const [userHighlights, setUserHighlights] = useState<UserVideoHighlight[]>([]);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const activeChapter = video.chapters.find(
    (chapter) => currentTime >= chapter.startSeconds && (chapter.endSeconds === null || currentTime < chapter.endSeconds),
  );
  const normalizedQuery = transcriptQuery.trim().toLowerCase();
  const visibleTranscript = video.transcript.filter((segment) =>
    normalizedQuery ? segment.text.toLowerCase().includes(normalizedQuery) : true,
  );
  const summarySections = useMemo(
    () => [...video.chapters].sort((left, right) => (
      summaryMode === "timeline"
        ? left.startSeconds - right.startSeconds
        : left.theme.localeCompare(right.theme, "zh-CN") || left.startSeconds - right.startSeconds
    )),
    [summaryMode, video.chapters],
  );

  useEffect(() => {
    setQuickJudgmentOpen(true);
    setSummaryMode("timeline");
    setExpandedChapters([]);
    setHighlightFilter("all");
    setUserHighlights([]);
    setSelectionToolbar(null);
  }, [video.id]);

  const seekTo = (seconds: number) => {
    const player = videoRef.current;
    if (player) {
      player.currentTime = seconds;
      void player.play().catch(() => undefined);
    }
    onCurrentTimeChange(seconds);
  };

  const transcriptForChapter = (chapterId: string) => {
    const chapter = video.chapters.find((item) => item.id === chapterId);
    if (!chapter) return [];
    return video.transcript.filter((segment) => (
      segment.startSeconds >= chapter.startSeconds
      && (chapter.endSeconds === null || segment.startSeconds < chapter.endSeconds)
    ));
  };

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((current) => (
      current.includes(chapterId)
        ? current.filter((id) => id !== chapterId)
        : [...current, chapterId]
    ));
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
    setUserHighlights((current) => [{
      id: `user-highlight-${Date.now()}`,
      text: selectionToolbar.text,
      startSeconds: selectionToolbar.startSeconds,
      createdAt: new Date().toISOString(),
    }, ...current]);
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
    onPrototypeAction("已加入我的高光");
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
        <button type="button" className="mewmo-button mewmo-button--ghost" onClick={onToggleWatched}>
          {video.watchStatus === "watched" ? "标为未看" : "标为看完"}
        </button>
      </div>

      <div className="mewmo-video-player">
        <video
          key={video.id}
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={video.coverImage}
          src={video.mockVideoUrl}
          onLoadedMetadata={(event) => {
            const player = event.currentTarget;
            player.currentTime = Math.min(video.progressSeconds, player.duration || video.progressSeconds);
          }}
          onTimeUpdate={(event) => onCurrentTimeChange(event.currentTarget.currentTime)}
        />
      </div>

      <div className="mewmo-video-reader__state">
        <span className={`mewmo-video-status mewmo-video-status--${video.processingStatus}`}>{statusCopy[video.processingStatus]}</span>
        {activeChapter && <span>当前章节：{activeChapter.title}</span>}
      </div>

      <section className={`mewmo-video-quick-judgment ${quickJudgmentOpen ? "is-open" : ""}`}>
        <button type="button" className="mewmo-video-quick-judgment__head" onClick={() => setQuickJudgmentOpen((open) => !open)} aria-expanded={quickJudgmentOpen}>
          <span><PrototypeIcon name="spark" size={17} /><strong>AI 快速判断</strong><small>先用 1 分钟判断这条视频是否值得看</small></span>
          <span>{quickJudgmentOpen ? "收起" : "展开"}<PrototypeIcon name="caret" size={15} /></span>
        </button>
        {quickJudgmentOpen && (video.quickJudgment ? (
          <div className="mewmo-video-quick-judgment__body">
            <section className="mewmo-video-judgment-block mewmo-video-judgment-block--summary">
              <h2>摘要</h2>
              <p>{video.quickJudgment.summary}</p>
            </section>
            <section className="mewmo-video-judgment-block">
              <h2>亮点</h2>
              <ul>{video.quickJudgment.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="mewmo-video-judgment-block">
              <h2>思考</h2>
              <ul>{video.quickJudgment.thoughts.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section className="mewmo-video-judgment-block">
              <h2>术语解释</h2>
              <dl>{video.quickJudgment.terms.map((item) => <div key={item.term}><dt>{item.term}</dt><dd>{item.explanation}</dd></div>)}</dl>
            </section>
          </div>
        ) : <VideoUnavailable status={video.processingStatus} label="AI 快速判断" />)}
      </section>

      <div className="mewmo-video-tabs" role="tablist" aria-label="视频内容">
        {(["summary", "transcript", "highlights"] as VideoTab[]).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>
            {tab === "summary" ? "全文总结" : tab === "transcript" ? "原文细读" : `高光笔记 ${video.highlights.length + userHighlights.length || ""}`}
          </button>
        ))}
      </div>

      <div className="mewmo-video-action-bar">
        <button type="button" onClick={() => onPrototypeAction("已加入知识库") }><PrototypeIcon name="library" size={15} />加入知识库</button>
        <button type="button" onClick={() => onPrototypeAction("已复制当前内容") }><PrototypeIcon name="copy" size={15} />复制</button>
        <button type="button" onClick={() => onPrototypeAction("已准备导出") }><PrototypeIcon name="export" size={15} />导出</button>
        <button type="button" onClick={() => onPrototypeAction("已重新开始分析") }><PrototypeIcon name="sync" size={15} />重新分析</button>
      </div>

      {activeTab === "summary" && (
        <section className="mewmo-video-panel mewmo-video-selectable" onMouseUp={handleTextSelection}>
          <div className="mewmo-video-summary-toolbar">
            <div><strong>全文总结</strong><span>{summaryMode === "timeline" ? "顺着视频进度快速掌握内容" : "把分散观点重新聚合到主题下"}</span></div>
            <div className="mewmo-video-summary-modes" aria-label="总结方式">
              <button type="button" className={summaryMode === "timeline" ? "active" : ""} onClick={() => setSummaryMode("timeline")}>按时间线总结</button>
              <button type="button" className={summaryMode === "theme" ? "active" : ""} onClick={() => setSummaryMode("theme")}>按主题归纳</button>
            </div>
          </div>
          {summarySections.length > 0 ? (
            <div className="mewmo-video-summary-sections">
              {summarySections.map((chapter) => {
                const expanded = expandedChapters.includes(chapter.id);
                const transcript = transcriptForChapter(chapter.id);
                return (
                  <article key={chapter.id} className={`mewmo-video-summary-section ${activeChapter?.id === chapter.id ? "active" : ""}`} data-video-start={chapter.startSeconds}>
                    <header>
                      <button type="button" onClick={() => seekTo(chapter.startSeconds)}>{formatDuration(chapter.startSeconds)}</button>
                      <div><span>{summaryMode === "timeline" ? `第 ${video.chapters.indexOf(chapter) + 1} 部分` : chapter.theme}</span><h2>{chapter.title}</h2></div>
                      <button type="button" className="mewmo-video-summary-section__toggle" onClick={() => toggleChapter(chapter.id)}>{expanded ? "收起原文" : "展开原文"}<PrototypeIcon name="caret" size={14} /></button>
                    </header>
                    <p>{chapter.summary}</p>
                    {expanded && (
                      <div className="mewmo-video-summary-original">
                        {transcript.length > 0 ? transcript.map((segment) => (
                          <p key={segment.id} data-video-start={segment.startSeconds}><button type="button" onClick={() => seekTo(segment.startSeconds)}>{formatDuration(segment.startSeconds)}</button><span>{segment.text}</span></p>
                        )) : <span>这一部分暂时没有可用的逐字稿。</span>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <VideoUnavailable status={video.processingStatus} label="全文总结" />}
        </section>
      )}

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
                    <button type="button" className="mewmo-icon-button" onClick={() => onPrototypeAction("已复制高光笔记")} aria-label="复制高光"><PrototypeIcon name="copy-plain" size={14} /></button>
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
                    <button type="button" className="mewmo-icon-button" onClick={() => setUserHighlights((current) => current.filter((item) => item.id !== highlight.id))} aria-label="删除高光"><PrototypeIcon name="close" size={14} /></button>
                  </article>
                ))}
              </div> : <div className="mewmo-video-highlight-empty">在「全文总结」或「原文细读」中选中文字，即可一键加入这里。</div>}
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

function AddVideoModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (mode: AddMode, value: string) => void }) {
  const [mode, setMode] = useState<AddMode>("video");
  const [value, setValue] = useState("");
  if (!open) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) return;
    onAdd(mode, value.trim());
    setValue("");
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
        <form onSubmit={submit}>
          <label className="mewmo-video-add-field">
            <span>{mode === "video" ? "视频链接" : "频道或 UP 主链接"}</span>
            <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === "video" ? "粘贴 Bilibili / YouTube 视频链接" : "粘贴频道主页链接"} />
          </label>
          <div className="mewmo-video-add-support"><span>Bilibili</span><span>YouTube</span><small>仅演示前端识别和处理状态</small></div>
          <div className="addfeed__actions"><button type="button" className="mewmo-button mewmo-button--ghost" onClick={onClose}>取消</button><button type="submit" className="mewmo-button mewmo-button--primary" disabled={!value.trim()}>{mode === "video" ? "添加并分析" : "订阅频道"}</button></div>
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
  quickJudgment: _quickJudgment,
  keyPoints: _keyPoints,
  targetAudience: _targetAudience,
  chapters: _chapters,
  transcript: _transcript,
  highlights: _highlights,
  visualSummary: _visualSummary,
  ...item
}: VideoDetail): VideoListItem {
  return item;
}

function highlightText(text: string, query: string) {
  const value = query.trim();
  if (!value) return text;
  const index = text.toLowerCase().indexOf(value.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + value.length)}</mark>{text.slice(index + value.length)}</>;
}
