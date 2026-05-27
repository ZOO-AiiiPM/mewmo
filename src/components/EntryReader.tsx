import { useEffect, useMemo, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { FeedEntry, SubscriptionSource } from '../types';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { smoothScrollToTop } from '../lib/scrollToTop';

type Props = {
  entry: FeedEntry | null;
  source: SubscriptionSource | null;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
  expanded: boolean;
  onExpand: () => void;
};

function fmtPublished(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function EntryReader({
  entry,
  onBack,
  onForward,
  canBack,
  canForward,
  expanded,
  onExpand,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTitleInBar, setShowTitleInBar] = useState(false);
  const [copied, setCopied] = useState(false);

  // 缓存 sanitize 结果 + 手动写 innerHTML 绕开 dangerouslySetInnerHTML 在父
  // 组件 re-render（如 scroll 触发 setShowTitleInBar）时整块重设 DOM 子树的
  // 行为——之前用户报「向下滚动整个画面刷新一次」就是这个重设造成的。
  const contentHtml = useMemo(
    () => (entry?.content_html ? sanitizeHtml(entry.content_html) : ''),
    [entry?.content_html],
  );
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.innerHTML = contentHtml;
  }, [contentHtml]);

  // 切 entry 时回到顶部 + 重置 title fade
  useEffect(() => {
    setShowTitleInBar(false);
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [entry?.id]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    const h1 = h1Ref.current;
    if (!scroller || !h1) return;
    // h1 底边距 scroller 顶部的距离（相对 viewport）
    // h1.offsetTop 是相对 offsetParent 的位置，其 parent 链最终汇到 scroller
    const rect = h1.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const h1BottomFromTop = rect.bottom - scrollerRect.top;
    // h1 底边滚出 toolbar 范围（48px）后，toolbar 备用 title 渐显
    setShowTitleInBar(h1BottomFromTop < 24);
  };

  if (!entry) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="h-12 shrink-0" />
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-stone-400 dark:text-stone-500 text-sm">
          <div className="text-2xl">📰</div>
          <div>从中间列表点选一条订阅内容</div>
        </div>
      </main>
    );
  }

  const publishedText = fmtPublished(entry.published_at);
  const openOriginal = () => {
    if (!entry.link) return;
    openUrl(entry.link);
  };
  const copyLink = () => {
    if (!entry.link) return;
    navigator.clipboard.writeText(entry.link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(e => console.error('[entry] copy link failed:', e));
  };

  return (
    <main className="relative flex-1 flex flex-col overflow-hidden">
      {/* 内容滚动容器：占满 main，pt 让出 toolbar + 呼吸空间 */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto sidebar-scroll"
      >
        <div className="max-w-2xl mx-auto px-10 pt-[72px] pb-16">
          {/* 标题 */}
          <h1
            ref={h1Ref}
            className="text-[28px] font-bold tracking-tight text-stone-900 dark:text-stone-50 leading-tight mb-3"
          >
            {entry.title || '无标题'}
          </h1>

          {/* meta：作者 · 时间（来源已在 toolbar 中部 favicon + site link，不重复） */}
          {(entry.author || publishedText) && (
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[13px] text-stone-500 dark:text-stone-400 mb-5">
              {entry.author && (
                <span className="font-medium text-stone-700 dark:text-stone-300">{entry.author}</span>
              )}
              {entry.author && publishedText && (
                <span className="text-stone-300 dark:text-stone-600">·</span>
              )}
              {publishedText && <span>{publishedText}</span>}
            </div>
          )}

          {/* 正文 */}
          {entry.content_html ? (
            <div ref={contentRef} className="clip-prose" />
          ) : (
            <div className="text-stone-400 dark:text-stone-500 text-sm italic">暂无正文内容</div>
          )}
        </div>
      </div>

      {/* toolbar 浮层：absolute top:0，不透明背景，避免全屏切换时 GPU 持续 invalidate */}
      <div className="absolute top-0 inset-x-0 z-10 h-12 flex items-center pl-3 pr-2 gap-0.5 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md">
        {/* 滚动后显现的底部分隔线：左右收 12px 留呼吸 */}
        <div className={`absolute bottom-0 left-3 right-3 h-px transition-colors duration-200 ${showTitleInBar ? 'bg-black/[0.1] dark:bg-white/[0.1]' : 'bg-transparent'}`} />
        {/* 左：title 渐显（h1 滚出 viewport 后），直接 truncate 不用 mask 避免 GPU 重计算 */}
        <div
          className="flex-1 min-w-0 text-[15px] font-semibold text-stone-900 dark:text-stone-100 truncate transition-opacity duration-150 select-none pr-3"
          style={{ opacity: showTitleInBar ? 1 : 0 }}
        >
          {entry.title || '无标题'}
        </div>

        {/* 右：icons 群 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onBack}
            disabled={!canBack}
            title="返回上一条"
            className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </button>
          <button
            onClick={onForward}
            disabled={!canForward}
            title="前进"
            className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
          {/* 分隔线 */}
          <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
          {entry.link && (
            <button
              onClick={openOriginal}
              title="在浏览器打开原文"
              className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              {/* 地球 icon (lucide globe) */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </button>
          )}
          {entry.link && (
            <button
              onClick={copyLink}
              title={copied ? '已复制' : '复制链接'}
              className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              {copied ? (
                /* check icon (lucide check) */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                /* link icon (lucide link) */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              )}
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
          <button
            onClick={() => smoothScrollToTop(scrollerRef.current)}
            title="回到顶部"
            className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {/* arrow-up-to-line icon (lucide) */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h14" />
              <path d="m18 13-6-6-6 6" />
              <path d="M12 7v14" />
            </svg>
          </button>
          <button
            onClick={onExpand}
            title={expanded ? '收起' : '专注模式'}
            className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {expanded ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="10 5 10 10 5 10" />
                <line x1="10" y1="10" x2="3" y2="3" />
                <polyline points="14 19 14 14 19 14" />
                <line x1="14" y1="14" x2="21" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="8 3 3 3 3 8" />
                <line x1="3" y1="3" x2="10" y2="10" />
                <polyline points="16 21 21 21 21 16" />
                <line x1="14" y1="14" x2="21" y2="21" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
