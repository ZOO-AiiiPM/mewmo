import { useMemo, useState } from 'react';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { parseHeadings } from '../lib/parseHeadings';

type Props = {
  content: string;
  cursorLine: number;
  cmRef: React.RefObject<ReactCodeMirrorRef | null>;
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

export function TableOfContents({ content, cursorLine, cmRef }: Props) {
  const [hover, setHover] = useState(false);
  const headings = useMemo(() => parseHeadings(content), [content]);

  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].line <= cursorLine) {
        idx = i;
        break;
      }
    }
    return idx;
  }, [headings, cursorLine]);

  if (headings.length === 0) return null;

  const jumpTo = (line: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    const lineObj = view.state.doc.line(line);
    // 设光标 + 让 cm 内部 state 同步，但不让它瞬时滚动（不传 scrollIntoView）
    view.dispatch({ selection: { anchor: lineObj.from } });
    // 自己计算 scrollTop 再做缓动
    const block = view.lineBlockAt(lineObj.from);
    const targetTop = Math.max(0, block.top - 32);
    smoothScrollTo(view.scrollDOM, targetTop, 450);
    // 动画末再 focus，避免动画中途因 focus 触发额外 scroll
    window.setTimeout(() => view.focus(), 460);
  };

  // 不同 level 的 mini bar 长度（拉开方差，视觉层级更清晰）
  const barWidth = (level: number) => {
    if (level === 1) return 26;
    if (level === 2) return 20;
    if (level === 3) return 14;
    return 9;
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="absolute top-16 right-0 bottom-6 z-10 flex items-start"
    >
      {/* 提示层：mini bars，按 level 阶梯递减 */}
      <div
        className={`flex flex-col items-end gap-2.5 py-3 pr-4 transition-opacity duration-200 ${
          hover ? 'opacity-0' : 'opacity-25 hover:opacity-60'
        }`}
      >
        {headings.map((h, i) => (
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
        className={`absolute top-0 right-3 min-w-[150px] max-w-[200px] max-h-full overflow-y-auto py-4 rounded-xl bg-white/95 dark:bg-stone-800/95 backdrop-blur-sm shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] transition-all duration-[400ms] ease-out ${
          hover
            ? 'opacity-100 translate-x-0'
            : 'opacity-0 translate-x-2 pointer-events-none'
        }`}
      >
        {headings.map((h, i) => (
          <button
            key={i}
            onClick={() => jumpTo(h.line)}
            style={{ paddingLeft: `${(h.level - 1) * 14 + 18}px` }}
            className={`w-full text-left pr-5 py-2.5 text-[13px] leading-relaxed truncate transition-colors ${
              i === activeIdx
                ? 'text-blue-600 dark:text-blue-400 font-medium'
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
