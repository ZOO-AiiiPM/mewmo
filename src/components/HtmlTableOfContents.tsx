import { useEffect, useMemo, useState } from 'react';

type HtmlHeading = {
  level: number;
  text: string;
  el: HTMLElement;
};

type Props = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** 外层 reader 区滚动容器（HtmlReader 的 scrollRef）—— iframe 高度撑开后真正滚动的是这个 */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 每次 iframe 加载完父层 +1 触发重抽 headings */
  refreshKey: number;
};

/** easeOutCubic：先快后慢（同 TableOfContents） */
function smoothScrollTo(el: HTMLElement, to: number, duration = 450) {
  const from = el.scrollTop;
  const distance = to - from;
  if (Math.abs(distance) < 1) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.scrollTop = from + distance * eased;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const barWidth = (level: number) => {
  if (level === 1) return 16;
  if (level === 2) return 13;
  if (level === 3) return 9;
  return 6;
};

/**
 * HtmlTableOfContents —— iframe 渲染的 HTML 笔记目录浮层
 *
 * 跟 mewmo 现有 TableOfContents 视觉对齐（hover mini-bars + 展开面板），但内部不同：
 * - markdown 版走 parseHeadings（line-based）+ CodeMirror selection 跳
 * - HTML 版走 iframe.contentDocument.querySelectorAll('h1-h6') + getBoundingClientRect 滚外层 wrapper
 *
 * 跳过 display:none 的 heading —— HtmlReader 的 hideAutoToc 已经把 HTML 自带「目录」段隐藏，
 * 这里 filter offsetParent === null 就自然跳过，不会把「目录」item 串进 mewmo 的目录浮层
 */
export function HtmlTableOfContents({ iframeRef, scrollRef, refreshKey }: Props) {
  const [headings, setHeadings] = useState<HtmlHeading[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [hover, setHover] = useState(false);

  // iframe 加载完 → 从 contentDocument 抽 h1-h6
  useEffect(() => {
    const ifr = iframeRef.current;
    const doc = ifr?.contentDocument;
    if (!doc) {
      setHeadings([]);
      return;
    }
    const nodes = Array.from(doc.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    const list: HtmlHeading[] = nodes
      // offsetParent === null → 该 heading 被 hideAutoToc 隐藏（或父容器 display:none），跳过
      .filter(el => el.offsetParent !== null && (el.textContent?.trim() ?? '').length > 0)
      .map(el => ({
        level: parseInt(el.tagName.slice(1), 10),
        text: el.textContent!.trim(),
        el,
      }));
    setHeadings(list);
    setActiveIdx(list.length > 0 ? 0 : -1);
  }, [refreshKey, iframeRef]);

  // active 高亮：监听外层 wrapper scroll，找最后一个 top < toolbar 下沿 + 一点的 heading
  useEffect(() => {
    const wrapper = scrollRef.current;
    if (!wrapper || headings.length === 0) return;
    const onScroll = () => {
      const wrapperTop = wrapper.getBoundingClientRect().top;
      // 阈值取 toolbar 高 (48) + 一点呼吸 = ~80px：heading 滚到这条线下面就算"已通过"
      const threshold = wrapperTop + 80;
      let idx = -1;
      for (let i = 0; i < headings.length; i++) {
        const top = headings[i].el.getBoundingClientRect().top;
        if (top <= threshold) {
          idx = i;
        } else {
          break;
        }
      }
      setActiveIdx(idx);
    };
    onScroll();
    wrapper.addEventListener('scroll', onScroll, { passive: true });
    return () => wrapper.removeEventListener('scroll', onScroll);
  }, [headings, scrollRef]);

  const jumpTo = (idx: number) => {
    const wrapper = scrollRef.current;
    if (!wrapper) return;
    const el = headings[idx]?.el;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    // viewport 相对 → wrapper.scrollTop 相对：scrollTop_当前 + (heading_top - wrapper_top) - toolbar 留白
    const target = Math.max(0, wrapper.scrollTop + (rect.top - wrapperRect.top) - 60);
    smoothScrollTo(wrapper, target, 450);
    setActiveIdx(idx);
  };

  // memo 避免每次 re-render 重新算 bar widths
  const bars = useMemo(
    () =>
      headings.map((h, i) => ({
        key: i,
        width: barWidth(h.level),
        active: i === activeIdx,
      })),
    [headings, activeIdx],
  );

  if (headings.length === 0) return null;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="absolute top-[18%] right-0 bottom-6 z-10 flex items-start"
    >
      {/* 提示层 mini bars */}
      <div
        className={`flex flex-col items-end gap-[13px] py-3 pr-4 transition-opacity duration-200 ${
          hover ? 'opacity-0' : 'opacity-50 hover:opacity-80'
        }`}
      >
        {bars.map(b => (
          <div
            key={b.key}
            style={{ width: `${b.width}px` }}
            className={`h-[2px] rounded-full transition-all duration-200 ${
              b.active ? 'bg-stone-800 dark:bg-stone-100' : 'bg-stone-400 dark:bg-stone-500'
            }`}
          />
        ))}
      </div>

      {/* hover 展开面板 */}
      <div
        className={`absolute top-0 right-3 min-w-[150px] max-w-[260px] max-h-full overflow-y-auto py-4 rounded-xl bg-white/95 dark:bg-stone-800/95 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] transition-all duration-[400ms] ease-out ${
          hover ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'
        }`}
      >
        {headings.map((h, i) => (
          <button
            key={i}
            onClick={() => jumpTo(i)}
            style={{ paddingLeft: `${(h.level - 1) * 14 + 18}px` }}
            className={`w-full text-left pr-5 py-2.5 text-[13px] leading-relaxed truncate transition-colors ${
              i === activeIdx
                ? 'text-stone-900 dark:text-stone-50 font-bold'
                : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
            }`}
          >
            {h.text}
          </button>
        ))}
      </div>
    </div>
  );
}
