import { useEffect, useMemo, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { FeedEntry, SubscriptionSource } from '../types';
import { sanitizeHtml } from '../lib/sanitizeHtml';
import { getSessionScrollPosition, rememberSessionScrollPosition } from '../lib/sessionScrollMemory';
import { ScrollToTopButton } from './ScrollToTopButton';

type Props = {
  entry: FeedEntry | null;
  source: SubscriptionSource | null;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
  expanded: boolean;
  onExpand: () => void;
  onClipSave?: (url: string) => Promise<void>;
  clippedUrls?: Set<string>;
};

function isNeutralColor(c: string): boolean {
  if (!c) return false;
  const m = c.match(/rgba?\((\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) {
    const channels = [+m[1], +m[2], +m[3]];
    return Math.max(...channels) - Math.min(...channels) < 30;
  }
  if (!c.startsWith('#')) return false;
  const hex = c.slice(1);
  const channels = hex.length === 3
    ? [hex[0] + hex[0], hex[1] + hex[1], hex[2] + hex[2]].map(v => parseInt(v, 16))
    : hex.length === 6
      ? [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(v => parseInt(v, 16))
      : null;
  if (!channels) return false;
  const [r, g, b] = channels;
  return Math.max(r, g, b) - Math.min(r, g, b) < 30;
}

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
  onClipSave,
  clippedUrls,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTitleInBar, setShowTitleInBar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [justClipped, setJustClipped] = useState(false);
  const isClipped = justClipped || (!!entry?.link && !!clippedUrls?.has(entry.link));
  const entryScrollKey = entry ? `entry:${entry.id}` : null;

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

  // 深色模式下剥掉灰阶 inline color，保留彩色装饰；切主题或 DOM 重渲染时同步刷新。
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const apply = () => {
      const isDark = document.documentElement.classList.contains('dark');
      root.querySelectorAll<HTMLElement>('[style]').forEach(el => {
        if (el.dataset.origColor === undefined) {
          el.dataset.origColor = el.style.color || '';
        }
        const oc = el.dataset.origColor || '';
        if (!isDark) { el.style.color = oc; return; }
        el.style.color = isNeutralColor(oc) ? '' : oc;
      });
    };
    apply();
    const themeObs = new MutationObserver(apply);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const contentObs = new MutationObserver(apply);
    contentObs.observe(root, { childList: true, subtree: true });
    return () => {
      themeObs.disconnect();
      contentObs.disconnect();
    };
  }, [entry?.id]);

  // 切 entry 时恢复本次运行内的阅读位置；没有记录才回到顶部。
  useEffect(() => {
    if (!entryScrollKey) {
      setShowTitleInBar(false);
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = getSessionScrollPosition(entryScrollKey) ?? 0;
    scroller.scrollLeft = 0;
    const h1 = h1Ref.current;
    if (h1) {
      const rect = h1.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      setShowTitleInBar(rect.bottom - scrollerRect.top < 24);
    } else {
      setShowTitleInBar(false);
    }
    return () => {
      rememberSessionScrollPosition(entryScrollKey, scroller.scrollTop);
    };
  }, [entryScrollKey]);

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
    if (entryScrollKey) {
      rememberSessionScrollPosition(entryScrollKey, scroller.scrollTop);
    }
  };

  if (!entry) {
    return (
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
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
  const clipEntry = async () => {
    if (!entry.link || !onClipSave || clipping) return;
    setClipping(true);
    try {
      await onClipSave(entry.link);
      setJustClipped(true);
    } catch (e) {
      console.error('[entry] clip save failed:', e);
    } finally {
      setClipping(false);
    }
  };

  return (
    <main className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* 内容滚动容器：占满 main，pt 让出 toolbar + 呼吸空间 */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden sidebar-scroll"
      >
        <div className="w-full min-w-0 max-w-2xl mx-auto px-10 pt-[72px] pb-16">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                /* link icon (lucide link) */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              )}
            </button>
          )}
          {entry.link && onClipSave && (
            <button
              onClick={clipEntry}
              disabled={clipping || isClipped}
              title={isClipped ? '已收藏' : '收藏到剪藏'}
              className="w-8 h-8 grid place-items-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {isClipped ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
              ) : clipping ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                </svg>
              )}
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/10" />
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
      <ScrollToTopButton scrollRef={scrollerRef} />
    </main>
  );
}
