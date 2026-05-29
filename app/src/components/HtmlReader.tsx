import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Note } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { HtmlTableOfContents } from './HtmlTableOfContents';

type Props = {
  note: Note | null;
  aiOpen: boolean;
  expanded: boolean;
  onExpand: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onImport: () => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
};

const BTN = "w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors";
const BTN_DISABLED = "w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:hover:bg-transparent disabled:text-stone-300 disabled:dark:text-stone-600 disabled:cursor-not-allowed transition-colors";
const BTN_DELETE = "w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors";

/**
 * 启发式屏蔽 HTML 自带的目录区块（既然 mewmo 浮层有目录功能，原文目录冗余）
 *
 * 三类 TOC 模式：
 * - HTML5 语义 `<nav>` 元素 —— 推荐 TOC 用法，命中率高
 * - class / id 含 toc / table-of-contents —— 工程模板（pandoc / sphinx / hexo）大量用
 * - 首个 heading 文本是「目录 / 目錄 / 大纲 / 目次 / Contents / Table of Contents / TOC」
 *   → 隐藏 heading + 紧随的 ul/ol/p/div 直到下一个 heading
 *
 * 启发式天然有误伤风险，原则：宁可漏不可误删 —— 只命中第一个 heading 匹配（避免删后续正文里
 * 提到「目录」的段落），紧随元素只跟到非 list/paragraph 容器就停（避免吃掉第一节正文）
 */
function hideAutoToc(doc: Document) {
  // 模式 1: <nav>
  doc.querySelectorAll('nav').forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });

  // 模式 2: class / id 含 toc 或 table-of-contents
  const cssCandidates = [
    '[class*="toc" i]',
    '[class*="table-of-contents" i]',
    '[id*="toc" i]',
    '[id*="table-of-contents" i]',
    '[class*="catalog" i]',
  ];
  doc.querySelectorAll(cssCandidates.join(',')).forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });

  // 模式 3: 首个 heading 文本匹配
  const tocTextRe = /^\s*(目录|目錄|大纲|大綱|目次|Contents?|Table\s+of\s+Contents|TOC)\s*[:：]?\s*$/i;
  const headings = Array.from(doc.querySelectorAll<HTMLElement>('h1, h2, h3, h4'));
  for (const h of headings) {
    const t = (h.textContent ?? '').trim();
    if (!tocTextRe.test(t)) continue;
    h.style.display = 'none';
    let sib = h.nextElementSibling as HTMLElement | null;
    while (sib) {
      const tag = sib.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) break;
      // 只跟 list / 段落 / 容器，碰到其他（hr / figure / pre / code 等）就停
      if (['ul', 'ol', 'p', 'div', 'dl'].includes(tag)) {
        sib.style.display = 'none';
      } else {
        break;
      }
      sib = sib.nextElementSibling as HTMLElement | null;
    }
    break; // 只命中第一个 toc heading
  }
}

/**
 * HtmlReader —— 导入的本地 HTML 文件**保留浏览器原生渲染**
 *
 * 设计要点：
 * - 用 `<iframe srcdoc>` 隔离渲染：HTML 自带的 `<style>` / `<link>` / inline color / 字体全部生效，
 *   不被 mewmo 自己的 prose 样式 / 主题 / 字号污染（这正是用户要的"浏览器原本的展示效果"）
 * - sandbox="allow-same-origin"：允许 iframe 访问自身 contentDocument（用来量内容高度 + 监听链接点击），
 *   但**不开 allow-scripts**——HTML 笔记可能来自外部，禁 JS 执行避 XSS / tracker
 * - iframe 高度自适应：onLoad 后取 documentElement.scrollHeight 撑开 iframe（外层 reader 区滚动条接管），
 *   ResizeObserver 跟图片懒加载等动态高度变化
 * - 链接点击：拦截 iframe 内 click，http(s) 链接走 Tauri opener 调系统浏览器；其他链接 default 走（about: / mailto: 等）
 *
 * 不可编辑（导入的 .html 视为外部素材）；想改在 Obsidian / 外部编辑器改 vault 文件后重启 mewmo。
 */
export function HtmlReader({
  note, aiOpen, expanded, onExpand, onDelete, onCreate, onImport,
  canBack, canForward, onBack, onForward,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // iframe load 后 +1 → HtmlTableOfContents useEffect 重抽 headings（hideAutoToc 之后才抽，避免目录条目串进去）
  const [tocRefreshKey, setTocRefreshKey] = useState(0);

  // iframe 内容加载完：屏蔽自带目录 + 测高度撑开 + 监听链接 + 通知 TOC 重抽
  const handleIframeLoad = () => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    const doc = ifr.contentDocument;
    if (!doc) return;

    // 1. 先屏蔽自带目录（必须在 TOC 抽 headings 之前，让被隐藏的 toc heading offsetParent 为 null）
    hideAutoToc(doc);

    const adjustHeight = () => {
      const h = Math.max(
        doc.documentElement?.scrollHeight ?? 0,
        doc.body?.scrollHeight ?? 0,
      );
      if (h > 0) ifr.style.height = `${h}px`;
    };
    adjustHeight();

    if (doc.body && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(adjustHeight);
      ro.observe(doc.body);
    }

    doc.addEventListener('click', (e) => {
      const target = e.target as Element | null;
      const a = target?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        openUrl(href).catch(err => console.error('[html-reader] open url failed:', err));
      }
    });

    // 2. 通知 HtmlTableOfContents 重抽 headings（此时 hideAutoToc 已隐藏 toc 段，filter offsetParent 自动跳过）
    setTocRefreshKey(k => k + 1);
  };

  // 切笔记时 reader 区滚回顶部（iframe 自己 srcDoc 变会自动从头开始，但外层 scroll 也要重置）
  useEffect(() => {
    if (!note?.id) return;
    const root = scrollRef.current;
    if (root) root.scrollTop = 0;
  }, [note?.id]);

  if (!note) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="h-12 shrink-0" />
        <div className="flex-1 flex items-center justify-center text-stone-400 dark:text-stone-500 text-sm">
          从左侧选一条笔记，或新建一条 ✨
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex-1 flex flex-col overflow-hidden">
      {/* Toolbar —— title 始终显示（HTML 笔记没有 H1 fade-in 机制，因为 iframe 隔离测不到原 HTML 的 H1 位置） */}
      <div className={`absolute top-0 left-0 right-0 z-[5] h-12 grid grid-cols-[1fr_auto] items-center gap-3 pl-10 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-3'}`}>
        <div className={`absolute bottom-0 left-3 h-px bg-black/[0.08] dark:bg-white/[0.08] transition-[right] duration-200 ease-out ${aiOpen ? 'right-[320px]' : 'right-3'}`} />
        <div className="min-w-0 overflow-hidden flex items-center gap-2">
          <span
            className="block whitespace-nowrap text-[14px] font-bold text-stone-800 dark:text-stone-100"
            style={{
              maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)',
              WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)',
            }}
          >
            {note.title || '无标题'}
          </span>
          <span
            className="shrink-0 text-[9px] font-medium px-1 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 uppercase tracking-wide leading-none"
            title="导入的 HTML 笔记，浏览器原生渲染"
          >
            HTML
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={onBack} disabled={!canBack} title="返回上一条笔记" className={BTN_DISABLED}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </button>
          <button onClick={onForward} disabled={!canForward} title="前进到下一条笔记" className={BTN_DISABLED}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
          <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1.5" />
          <button onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} title="回到顶部" className={BTN}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h14" />
              <path d="m18 13-6-6-6 6" />
              <path d="M12 7v14" />
            </svg>
          </button>
          <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1.5" />
          <button onClick={onExpand} title={expanded ? '收起 (⌘⇧F)' : '专注模式 (⌘⇧F)'} className={BTN}>
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
          <button onClick={onImport} title="导入 HTML 文件 / 目录到笔记" className={BTN}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="m9 15 3-3 3 3" />
            </svg>
          </button>
          <button onClick={() => setConfirmOpen(true)} title="删除笔记" className={BTN_DELETE}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </button>
          <button onClick={onCreate} title="新建笔记" className={BTN}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 阅读区 —— iframe 撑满宽度，外层 scroll 接管整页滚动；不加 max-w-2xl，让 HTML 自带的 layout 决定排版 */}
      <div ref={scrollRef} className={`flex-1 overflow-y-auto sidebar-scroll transition-[padding-right] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : ''} pt-12`}>
        {note.content_md ? (
          <iframe
            ref={iframeRef}
            // key 让切笔记时 iframe 完全重建（避免 React 复用 iframe 把上一篇的高度 / scroll 串到下一篇）
            key={note.id}
            srcDoc={note.content_md}
            sandbox="allow-same-origin"
            onLoad={handleIframeLoad}
            title={note.title || '无标题'}
            // 默认占满 reader 高度；onLoad 后会被 inline style.height 覆盖成实际内容高度
            style={{ width: '100%', minHeight: 'calc(100vh - 100px)', border: 'none', display: 'block' }}
          />
        ) : (
          <div className="px-10 py-10 text-stone-400 dark:text-stone-500 text-sm italic">这个 HTML 文件是空的</div>
        )}
      </div>

      <HtmlTableOfContents
        iframeRef={iframeRef}
        scrollRef={scrollRef}
        refreshKey={tocRefreshKey}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="删除笔记"
        description={`确定删除「${note.title || '无标题'}」吗？\nvault 内的 .html 源文件也会一起被删除。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
