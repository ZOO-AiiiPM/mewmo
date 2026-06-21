import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { parseHeadings } from '../lib/parseHeadings';
import { useVisibleTocBarCount } from './useVisibleTocBarCount';

type Props = {
  content: string;
  title: string;
  cmRef: React.RefObject<ReactCodeMirrorRef | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

/** easeOutCubic：先快后慢（t³ 反向），最常被感知为"自然减速" */
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

const ACTIVE_TOP_OFFSET = 120;

export function TableOfContents({ content, title, cmRef, scrollRef }: Props) {
  const tocRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const bodyHeadings = useMemo(() => parseHeadings(content), [content]);
  const headings = useMemo(
    () => [{ level: 1, text: title || '无标题', line: 0 }, ...bodyHeadings],
    [title, bodyHeadings],
  );
  const visibleBarCount = useVisibleTocBarCount(tocRef, headings.length);

  useEffect(() => {
    const wrapper = scrollRef.current;
    if (!wrapper || headings.length === 0) return;

    const calcActive = () => {
      const v = cmRef.current?.view;
      if (!v) return;
      const threshold = wrapper.scrollTop + ACTIVE_TOP_OFFSET;
      const cmContent = v.contentDOM as HTMLElement;
      const cmTopInWrapper =
        cmContent.getBoundingClientRect().top -
        wrapper.getBoundingClientRect().top +
        wrapper.scrollTop;

      let idx = 0;
      for (let i = 1; i < headings.length; i++) {
        const lineObj = v.state.doc.line(headings[i].line);
        const block = v.lineBlockAt(lineObj.from);
        const top = cmTopInWrapper + block.top;
        if (top <= threshold) {
          idx = i;
        } else {
          break;
        }
      }
      setActiveIdx(idx);
    };

    calcActive();
    wrapper.addEventListener('scroll', calcActive, { passive: true });
    return () => wrapper.removeEventListener('scroll', calcActive);
  }, [headings, cmRef, scrollRef, content]);

  if (headings.length === 0) return null;

  const jumpTo = (line: number) => {
    const view = cmRef.current?.view;
    const wrapper = scrollRef.current;
    if (!wrapper) return;
    if (line === 0) {
      smoothScrollTo(wrapper, 0, 450);
      return;
    }
    if (!view) return;
    const lineObj = view.state.doc.line(line);
    view.dispatch({ selection: { anchor: lineObj.from } });
    const block = view.lineBlockAt(lineObj.from);
    const cmContent = view.contentDOM as HTMLElement;
    const cmTopInWrapper =
      cmContent.getBoundingClientRect().top -
      wrapper.getBoundingClientRect().top +
      wrapper.scrollTop;
    const targetTop = Math.max(0, cmTopInWrapper + block.top - 60);
    smoothScrollTo(wrapper, targetTop, 450);
  };

  // 不同 level 的 mini bar 长度（拉开方差，视觉层级更清晰）
  const barWidth = (level: number) => {
    if (level === 1) return 16;
    if (level === 2) return 13;
    if (level === 3) return 9;
    return 6;
  };

  return (
    <div
      ref={tocRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="absolute top-[18%] right-0 bottom-[18%] z-10 flex items-start"
    >
      {/* 提示层：mini bars，按 level 阶梯递减 */}
      <div
        className={`flex flex-col items-end gap-[13px] py-3 pr-4 overflow-hidden transition-opacity duration-200 ${
          hover ? 'opacity-0' : 'opacity-50 hover:opacity-80'
        }`}
      >
        {headings.slice(0, visibleBarCount).map((h, i) => (
          <div
            key={i}
            style={{ width: `${barWidth(h.level)}px` }}
            className={`h-[2px] rounded-full transition-all duration-200 ${
              i === activeIdx
                ? 'bg-stone-800 dark:bg-stone-100'
                : 'bg-stone-400 dark:bg-stone-500'
            }`}
          />
        ))}
      </div>

      {/* Hover 展开面板 */}
      <div
        className={`absolute top-0 right-3 max-w-[180px] max-h-full overflow-y-auto py-1.5 rounded-xl backdrop-blur-xl bg-white/75 dark:bg-stone-800/75 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] transition-all duration-[400ms] ease-out [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-8px),transparent)] ${
          hover
            ? 'opacity-100 translate-x-0'
            : 'opacity-0 translate-x-2 pointer-events-none'
        }`}
      >
        {headings.map((h, i) => (
          <button
            key={i}
            onClick={() => jumpTo(h.line)}
            style={{
              paddingLeft: `${(h.level - 1) * 12 + 14}px`,
              fontSize: '12px',
              lineHeight: 1.5,
              paddingTop: '2px',
              paddingBottom: '2px',
            }}
            className={`w-full text-left pr-3 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] transition-colors ${
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
