import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
};

export function AddSourceDialog({ open, onClose, onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(url.trim());
      setUrl('');
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(prettifyError(raw));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[460px] max-w-[calc(100%-64px)] bg-white dark:bg-stone-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] p-6 border border-black/[0.05] dark:border-white/[0.05]">
        <h3 className="text-[16px] font-semibold text-stone-900 dark:text-stone-100 mb-1.5">
          添加订阅源
        </h3>
        <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
          粘贴 RSS / Atom 链接（如 <code className="text-[12px] bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-0.5 rounded">https://example.com/feed</code>）。
        </p>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="https://stratechery.com/feed"
          disabled={busy}
          className={`w-full px-3.5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-[14px] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none border ${
            error ? 'border-red-500/50 bg-red-500/[0.05]' : 'border-transparent focus:border-stone-400 dark:focus:border-stone-500'
          }`}
        />

        {error && (
          <div className="mt-2 text-[12px] text-red-600 dark:text-red-400 flex items-start gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <details className="mt-4 text-[12px] text-stone-500 dark:text-stone-400">
          <summary className="cursor-pointer flex items-center gap-1.5 py-2 text-stone-700 dark:text-stone-300 font-medium hover:text-stone-900 dark:hover:text-stone-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            想订阅公众号 / X / YouTube？
          </summary>
          <div className="mt-2 p-3 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg leading-relaxed">
            vibe 笔记不直接抓取这些平台（避免封号风险 + 协议合规）。请先跑一个<strong>桥接服务</strong>输出 RSS，再粘到上面：
            <ul className="mt-2 ml-4 list-disc space-y-1">
              <li>
                <strong>公众号</strong> →{' '}
                <a
                  href="https://github.com/rachelos/we-mp-rss"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  we-mp-rss
                </a>
                （MIT 开源，docker 自部署，需自己申请公众号）
              </li>
              <li>
                <strong>X / YouTube / B站</strong> →{' '}
                <a
                  href="https://github.com/DIYgod/RSSHub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  RSSHub
                </a>{' '}
                自部署
              </li>
            </ul>
          </div>
        </details>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-stone-600 dark:text-stone-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || !url.trim()}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? '抓取中…' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}

function prettifyError(raw: string): string {
  if (raw.startsWith('INVALID_URL')) return 'URL 格式错误，请检查协议（http/https）和拼写';
  if (raw === 'DUPLICATE_URL') return '这个源已经订阅过了';
  if (raw.startsWith('FETCH_FAILED')) return `抓取失败：${raw.replace('FETCH_FAILED:', '').trim() || '检查网络或源是否可达'}`;
  if (raw.startsWith('PARSE_FAILED')) return `解析失败：这个 URL 不是合法的 RSS / Atom feed`;
  return raw;
}
