import { useMemo, useState } from 'react';
import { marked } from 'marked';
import type { Clip } from '../types';

marked.use({ gfm: true, breaks: true });

type Props = {
  clip: Clip | null;
  aiOpen: boolean;
  onRefetch?: (id: number, url: string) => Promise<void>;
  expanded: boolean;
  onExpand: () => void;
};

/// 把 ISO 8601 字符串渲染成本地化日期；解析失败返回原值
function fmtPublished(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ClipReader({ clip, aiOpen, onRefetch, expanded, onExpand }: Props) {
  const [refetching, setRefetching] = useState(false);

  const contentHtml = useMemo(() => {
    if (!clip?.content_md) return '';
    return marked.parse(clip.content_md) as string;
  }, [clip?.content_md]);

  const handleRefetch = async () => {
    if (!clip || !onRefetch || refetching) return;
    setRefetching(true);
    try {
      await onRefetch(clip.id, clip.url);
    } catch (e) {
      console.error('[refetch] failed:', e);
    } finally {
      setRefetching(false);
    }
  };

  if (!clip) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="h-12 shrink-0" />
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-stone-400 dark:text-stone-500 text-sm">
          <div className="text-2xl">📋</div>
          <div>从左侧选一条剪藏，或粘贴链接保存</div>
        </div>
      </main>
    );
  }

  const publishedText = fmtPublished(clip.published_at);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* 顶栏：来源链接 + 重抓按钮 */}
      <div className={`h-12 shrink-0 flex items-center gap-2 pl-4 transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-4'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {clip.favicon_url && (
            <img
              src={clip.favicon_url}
              alt=""
              referrerPolicy="no-referrer"
              className="w-4 h-4 rounded-sm shrink-0 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <a
            href={clip.url}
            onClick={e => {
              e.preventDefault();
              import('@tauri-apps/plugin-opener').then(m => m.open(clip.url));
            }}
            title={clip.url}
            className="text-[12px] text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 truncate max-w-xs transition-colors"
          >
            {clip.site_name || new URL(clip.url).hostname}
          </a>
        </div>

        {onRefetch && (
          <button
            onClick={handleRefetch}
            disabled={refetching}
            title="重抓元数据（封面 / 作者 / 日期 / 正文）"
            className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] rounded text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={refetching ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {refetching ? '抓取中…' : '重抓'}
          </button>
        )}
        <button
          onClick={onExpand}
          title={expanded ? '收起' : '专注模式'}
          className={`${onRefetch ? '' : 'ml-auto'} shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors`}
        >
          {expanded ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8V5a2 2 0 0 1 2-2h3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            </svg>
          )}
        </button>
      </div>

      {/* 阅读内容 */}
      <div className={`flex-1 overflow-y-auto transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[300px]' : ''}`}>
        <div className="max-w-2xl mx-auto px-10 pt-6 pb-16">
          {/* 标题 */}
          <h1 className="text-[28px] font-bold tracking-tight text-stone-900 dark:text-stone-50 leading-tight mb-3">
            {clip.title || '无标题'}
          </h1>

          {/* 元数据行：作者 • 公众号 • 日期（仿 Cubox 顶部 meta 行） */}
          {(clip.author || clip.site_name || publishedText) && (
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[13px] text-stone-500 dark:text-stone-400 mb-5">
              {clip.author && (
                <span className="font-medium text-stone-700 dark:text-stone-300">{clip.author}</span>
              )}
              {clip.author && clip.site_name && clip.author !== clip.site_name && (
                <span className="text-stone-300 dark:text-stone-600">·</span>
              )}
              {clip.site_name && clip.author !== clip.site_name && (
                <span>{clip.site_name}</span>
              )}
              {(clip.author || clip.site_name) && publishedText && (
                <span className="text-stone-300 dark:text-stone-600">·</span>
              )}
              {publishedText && <span>{publishedText}</span>}
            </div>
          )}

          {/* 封面图 hero（仅在 cover_image 存在时显示，从正文已 dedup） */}
          {clip.cover_image && (
            <img
              src={clip.cover_image}
              alt={clip.title}
              referrerPolicy="no-referrer"
              className="w-full max-h-96 object-cover rounded-lg mb-6 bg-stone-100 dark:bg-stone-800"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}

          {/* 摘要 */}
          {clip.excerpt && (
            <p className="text-[15px] text-stone-500 dark:text-stone-400 leading-relaxed mb-6 border-l-2 border-stone-200 dark:border-stone-700 pl-4">
              {clip.excerpt}
            </p>
          )}

          {/* 分隔线 */}
          <hr className="border-stone-200 dark:border-stone-700/60 mb-6" />

          {/* 正文 */}
          {contentHtml ? (
            <div
              className="clip-prose"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          ) : (
            <div className="text-stone-400 dark:text-stone-500 text-sm italic">暂无正文内容</div>
          )}
        </div>
      </div>
    </main>
  );
}
