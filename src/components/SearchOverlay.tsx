import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Note, Clip, SearchResults, NoteHit, ClipHit } from '../types';
import { searchAll } from '../lib/db';
import { sanitizeHtml } from '../lib/sanitizeHtml';

type Props = {
  open: boolean;
  notes: Note[];
  clips: Clip[];
  onPickNote: (id: number) => void;
  onPickClip: (id: number) => void;
  onClose: () => void;
};

type ActiveHit =
  | { kind: 'note'; id: number }
  | { kind: 'clip'; id: number }
  | null;

const EMPTY_NOTES: NoteHit[] = [];
const EMPTY_CLIPS: ClipHit[] = [];

export function SearchOverlay({
  open, notes, clips,
  onPickNote, onPickClip, onClose,
}: Props) {
  // 内部 state：query / results / loading 全部自管，App 不再持有
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦 input；关闭时清空 query / results 让下次打开是 fresh
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  // debounce 200ms 调 searchAll
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchAll(q)
        .then(r => setResults(r))
        .catch(e => {
          console.error('search failed:', e);
          setResults({ notes: [], clips: [] });
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  const noteHits = results?.notes ?? EMPTY_NOTES;
  const clipHits = results?.clips ?? EMPTY_CLIPS;
  const flatHits = useMemo<ActiveHit[]>(
    () => [
      ...noteHits.map(h => ({ kind: 'note' as const, id: h.id })),
      ...clipHits.map(h => ({ kind: 'clip' as const, id: h.id })),
    ],
    [noteHits, clipHits],
  );

  const [active, setActive] = useState<ActiveHit>(null);
  useEffect(() => {
    if (flatHits.length > 0) {
      setActive(prev => {
        if (prev && flatHits.some(h => h && h.kind === prev.kind && h.id === prev.id)) return prev;
        return flatHits[0];
      });
    } else {
      setActive(null);
    }
  }, [flatHits]);

  // 键盘：↑↓ 选 / ⏎ 打开 / ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (flatHits.length === 0) return;
      const idx = flatHits.findIndex(h => h && active && h.kind === active.kind && h.id === active.id);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(flatHits[Math.min(idx + 1, flatHits.length - 1)]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(flatHits[Math.max(idx - 1, 0)]);
      } else if (e.key === 'Enter') {
        if (!active) return;
        e.preventDefault();
        if (active.kind === 'note') onPickNote(active.id);
        else onPickClip(active.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, active, flatHits, onClose, onPickNote, onPickClip]);

  const total = noteHits.length + clipHits.length;
  const empty = !loading && query.trim() && total === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] bg-black/[0.18] flex items-start justify-center pt-14"
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-[860px] max-w-[calc(100vw-40px)] h-[540px] flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-stone-800 shadow-[0_18px_60px_rgba(0,0,0,0.18),0_0_0_0.5px_rgba(0,0,0,0.08)] dark:shadow-[0_18px_60px_rgba(0,0,0,0.55),0_0_0_0.5px_rgba(255,255,255,0.06)]"
          >
        {/* ── 顶部：可编辑 input，autofocus ── */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.08] dark:border-white/[0.08]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500 dark:text-stone-400 shrink-0">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记和剪藏…"
            className="flex-1 bg-transparent border-none outline-none text-[17px] font-medium text-stone-900 dark:text-stone-50 placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
          <kbd className="text-[10px] font-semibold tracking-wider text-stone-700 dark:text-stone-300 bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* ── 主体：左列表 + 右预览 ── */}
        <div className="flex-1 flex min-h-0">
          {/* 左：列表 */}
          <div className="w-[380px] shrink-0 overflow-y-auto p-1.5 border-r border-black/[0.07] dark:border-white/[0.06]">
            {!query.trim() && (
              <div className="h-full flex items-center justify-center text-stone-400 text-sm">
                输入关键词搜索
              </div>
            )}
            {loading && query.trim() && (
              <div className="h-full flex items-center justify-center text-stone-400 text-sm">搜索中…</div>
            )}
            {empty && (
              <div className="h-full flex flex-col items-center justify-center text-stone-500 dark:text-stone-400 text-sm gap-2">
                <div>没找到「{query}」</div>
                <div className="text-stone-400 dark:text-stone-500 text-xs">试试更短的关键词</div>
              </div>
            )}

            {noteHits.length > 0 && (
              <Group kind="notes" count={noteHits.length}>
                {noteHits.map(hit => (
                  <NoteRow
                    key={hit.id}
                    hit={hit}
                    active={active?.kind === 'note' && active.id === hit.id}
                    onHover={() => setActive({ kind: 'note', id: hit.id })}
                    onClick={() => onPickNote(hit.id)}
                  />
                ))}
              </Group>
            )}
            {clipHits.length > 0 && (
              <Group kind="clips" count={clipHits.length}>
                {clipHits.map(hit => (
                  <ClipRow
                    key={hit.id}
                    hit={hit}
                    active={active?.kind === 'clip' && active.id === hit.id}
                    onHover={() => setActive({ kind: 'clip', id: hit.id })}
                    onClick={() => onPickClip(hit.id)}
                  />
                ))}
              </Group>
            )}
          </div>

          {/* 右：预览 */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
            {!active && !loading && (
              <div className="h-full flex items-center justify-center text-stone-400 text-sm">
                {query.trim() ? '选一个结果看预览' : '输入关键词开始搜索'}
              </div>
            )}
            {active?.kind === 'note' && (
              <NotePreview
                hit={noteHits.find(h => h.id === active.id)}
                note={notes.find(n => n.id === active.id)}
              />
            )}
            {active?.kind === 'clip' && (
              <ClipPreview
                hit={clipHits.find(h => h.id === active.id)}
                clip={clips.find(c => c.id === active.id)}
              />
            )}
          </div>
        </div>

        {/* ── 底部：键盘提示 ── */}
        <div className="shrink-0 flex items-center gap-3.5 px-3.5 py-2 border-t border-black/[0.06] dark:border-white/[0.06] text-[11px] text-stone-500 dark:text-stone-400">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> 选择
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> 打开
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>esc</Kbd> 关闭
          </span>
          <span className="ml-auto text-stone-400 tabular-nums">{total} 个结果</span>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── 内部组件 ──────────────────────────────────────────────────────────────

const HIGHLIGHT_CLASSES =
  '[&_mark]:bg-stone-900/[0.10] [&_mark]:dark:bg-stone-100/[0.18] ' +
  '[&_mark]:text-inherit [&_mark]:px-[3px] [&_mark]:-mx-px ' +
  '[&_mark]:rounded-[3px] [&_mark]:font-inherit';

const SNIPPET_HIGHLIGHT =
  '[&_mark]:bg-stone-900/[0.14] [&_mark]:dark:bg-stone-100/[0.20] ' +
  '[&_mark]:text-stone-900 [&_mark]:dark:text-stone-100 ' +
  '[&_mark]:px-[3px] [&_mark]:-mx-px [&_mark]:rounded-[3px]';

function Group({ kind, count, children }: { kind: 'notes' | 'clips'; count: number; children: React.ReactNode }) {
  const isNotes = kind === 'notes';
  return (
    <section className="mb-1 first:mt-0 [&+&]:mt-1.5 [&+&]:pt-1.5 [&+&]:border-t [&+&]:border-black/5 [&+&]:dark:border-white/5">
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${
          isNotes
            ? 'bg-stone-900/[0.06] text-stone-900 dark:bg-stone-100/[0.12] dark:text-stone-50'
            : 'bg-stone-900/[0.04] text-stone-600 dark:bg-stone-100/[0.04] dark:text-stone-300 ring-[0.5px] ring-stone-900/[0.12] dark:ring-stone-100/[0.16]'
        }`}>
          {isNotes ? <NoteIcon /> : <ClipIcon />}
          {isNotes ? '笔记' : '剪藏'}
        </span>
        <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">{count} 条</span>
      </div>
      {children}
    </section>
  );
}

function NoteRow({ hit, active, onHover, onClick }: { hit: NoteHit; active: boolean; onHover: () => void; onClick: () => void }) {
  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      className={`px-3 py-2 rounded-lg cursor-pointer ${active ? 'bg-stone-900/[0.08] dark:bg-stone-100/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'}`}
    >
      <div
        className={`text-[14px] font-medium text-stone-900 dark:text-stone-50 leading-snug truncate ${HIGHLIGHT_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hit.title_html || '无标题', 'highlight') }}
      />
      <div
        className={`text-[12px] text-stone-500 dark:text-stone-400 leading-relaxed mt-0.5 line-clamp-2 ${SNIPPET_HIGHLIGHT}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hit.snippet || '', 'highlight') }}
      />
    </div>
  );
}

function ClipRow({ hit, active, onHover, onClick }: { hit: ClipHit; active: boolean; onHover: () => void; onClick: () => void }) {
  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      className={`px-3 py-2 rounded-lg cursor-pointer ${active ? 'bg-stone-900/[0.08] dark:bg-stone-100/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'}`}
    >
      <div
        className={`text-[14px] font-medium text-stone-900 dark:text-stone-50 leading-snug truncate ${HIGHLIGHT_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hit.title_html || '无标题', 'highlight') }}
      />
      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
        {hit.site_name && <span className="truncate">{hit.site_name}</span>}
        {hit.author && (
          <>
            <span className="opacity-60">·</span>
            <span className="truncate">{hit.author}</span>
          </>
        )}
      </div>
      <div
        className={`text-[12px] text-stone-500 dark:text-stone-400 leading-relaxed mt-0.5 line-clamp-2 ${SNIPPET_HIGHLIGHT}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hit.snippet || '', 'highlight') }}
      />
    </div>
  );
}

function NotePreview({ hit, note }: { hit?: NoteHit; note?: Note }) {
  if (!hit || !note) return null;
  return (
    <>
      <PreviewPill kind="notes" />
      <h2
        className={`text-[18px] font-semibold text-stone-900 dark:text-stone-50 leading-tight mb-3 ${HIGHLIGHT_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hit.title_html || '无标题', 'highlight') }}
      />
      <div className={`text-[13px] leading-[1.7] text-stone-700 dark:text-stone-300 whitespace-pre-wrap ${HIGHLIGHT_CLASSES}`}>
        {note.content_md || <span className="text-stone-400">空笔记</span>}
      </div>
    </>
  );
}

function ClipPreview({ hit, clip }: { hit?: ClipHit; clip?: Clip }) {
  if (!hit || !clip) return null;
  return (
    <>
      <PreviewPill kind="clips" />
      <h2
        className={`text-[18px] font-semibold text-stone-900 dark:text-stone-50 leading-tight mb-1.5 ${HIGHLIGHT_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(hit.title_html || '无标题', 'highlight') }}
      />
      <div className="flex items-center gap-2 text-[12px] text-stone-400 dark:text-stone-500 mb-4">
        {clip.site_name && <span>{clip.site_name}</span>}
        {clip.author && (<><span className="opacity-60">·</span><span>{clip.author}</span></>)}
        {clip.published_at && (<><span className="opacity-60">·</span><span>{clip.published_at.slice(0, 10)}</span></>)}
      </div>
      {clip.cover_image && (
        <img
          src={clip.cover_image}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full max-h-40 object-cover rounded-lg mb-4 bg-stone-200/60 dark:bg-stone-700/60"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className={`text-[13px] leading-[1.7] text-stone-700 dark:text-stone-300 whitespace-pre-wrap ${HIGHLIGHT_CLASSES}`}>
        {clip.content_md || clip.excerpt || <span className="text-stone-400">无正文</span>}
      </div>
    </>
  );
}

function PreviewPill({ kind }: { kind: 'notes' | 'clips' }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-2 rounded-full text-[11px] font-semibold text-stone-600 dark:text-stone-400 bg-stone-900/[0.05] dark:bg-stone-100/[0.08] tracking-wide">
      {kind === 'notes' ? <NoteIcon /> : <ClipIcon />}
      {kind === 'notes' ? '笔记' : '剪藏'}
    </span>
  );
}

function NoteIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
    </svg>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-inherit text-[10px] px-1.5 py-px bg-black/[0.05] dark:bg-white/[0.06] text-stone-700 dark:text-stone-300 rounded border-[0.5px] border-black/[0.08] dark:border-white/[0.08]">
      {children}
    </kbd>
  );
}
