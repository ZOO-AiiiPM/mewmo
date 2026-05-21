import { useState } from 'react';
import type { Clip } from '../types';

type Props = {
  clips: Clip[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onSave: (url: string) => Promise<void>;
  onDelete: (id: number) => void;
  hidden?: boolean;
};

function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function ClipInbox({ clips, selectedId, onSelect, onSave, onDelete, hidden = false }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    let url = input.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    setLoading(true);
    setError('');
    try {
      await onSave(url);
      setInput('');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setInput(''); setError(''); }
  };

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.05] dark:border-white/[0.05] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-56'}`}
    >
      {/* 顶栏 */}
      <div className="h-12 shrink-0 flex items-center px-3">
        <h1 className="text-[15px] font-medium tracking-tight text-stone-900 dark:text-stone-100 select-none">
          剪藏
        </h1>
      </div>

      {/* URL 输入区 */}
      <div className="px-3 pb-3">
        <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
          error
            ? 'border-red-400/60 bg-red-50/40 dark:bg-red-900/10'
            : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04]'
        }`}>
          {/* 链接图标 */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-stone-400 dark:text-stone-500">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="粘贴链接…"
            disabled={loading}
            className="flex-1 min-w-0 text-[12px] bg-transparent outline-none text-stone-800 dark:text-stone-200 placeholder:text-stone-400 dark:placeholder:text-stone-600 disabled:opacity-50"
          />
          {loading ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className="shrink-0 text-stone-400 animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : input.trim() ? (
            <button onClick={handleSave}
              className="shrink-0 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          ) : null}
        </div>
        {error && (
          <p className="mt-1 text-[11px] text-red-500 dark:text-red-400 leading-snug px-0.5">{error}</p>
        )}
      </div>

      {/* 剪藏列表 */}
      <div className="flex-1 overflow-y-auto">
        {clips.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-[13px] leading-relaxed">
            <div className="mb-1.5 text-2xl">🔗</div>
            <div>粘贴任意链接</div>
            <div className="text-stone-400 dark:text-stone-500">自动保存全文</div>
          </div>
        ) : (
          clips.map(clip => (
            <div
              key={clip.id}
              onClick={() => onSelect(clip.id)}
              className={`group relative px-3 py-2.5 cursor-pointer transition-colors ${
                selectedId === clip.id
                  ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex gap-2">
                {/* 左侧文字区 */}
                <div className="flex-1 min-w-0">
                  {/* 站点 + 时间 */}
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      {clip.favicon_url && (
                        <img
                          src={clip.favicon_url}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-3 h-3 rounded-sm shrink-0 object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <span className="text-[11px] text-stone-400 dark:text-stone-500 truncate">
                        {clip.site_name || '未知来源'}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">
                      {fmtTime(clip.saved_at)}
                    </span>
                  </div>

                  {/* 标题 */}
                  <div className="text-[13px] font-medium text-stone-900 dark:text-stone-100 leading-snug line-clamp-2 pr-8">
                    {clip.title || '无标题'}
                  </div>

                  {/* 作者 / 摘要：作者优先展示，否则降级到摘要 */}
                  {clip.author ? (
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                      {clip.author}
                    </div>
                  ) : clip.excerpt ? (
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 leading-snug line-clamp-2">
                      {clip.excerpt}
                    </div>
                  ) : null}
                </div>

                {/* 右侧封面缩略图（仅在 cover_image 存在时显示） */}
                {clip.cover_image && (
                  <img
                    src={clip.cover_image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-md shrink-0 object-cover bg-stone-200/40 dark:bg-stone-700/40 self-start"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>

              {/* 删除按钮 */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (confirm('删除这条剪藏？')) onDelete(clip.id);
                }}
                className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 px-1.5 py-0.5 text-[11px] rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400 transition-opacity"
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
