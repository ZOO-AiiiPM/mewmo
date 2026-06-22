import type React from 'react';
import type { Zone } from './Sidebar';

type Props = {
  onPick: (zone: Zone) => void;
};

type Entry = {
  zone: Zone;
  label: string;
  desc: string;
  enabled: boolean;
  icon: React.ReactNode;
};

const ENTRIES: Entry[] = [
  {
    zone: 'notes',
    label: '笔记',
    desc: '写点什么',
    enabled: true,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </svg>
    ),
  },
  {
    zone: 'clipping',
    label: '剪藏',
    desc: '粘贴链接保存',
    enabled: true,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
    ),
  },
  {
    zone: 'subscribe',
    label: '订阅',
    desc: '订 RSS / 公众号',
    enabled: true,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11a9 9 0 0 1 9 9" />
        <path d="M4 4a16 16 0 0 1 16 16" />
        <circle cx="5" cy="19" r="1" />
      </svg>
    ),
  },
];

export function EmptyTabHome({ onPick }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="text-stone-400 dark:text-stone-500 text-[13px] mb-6 select-none">
        新窗口 — 选个去处
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {ENTRIES.map(e => (
          <button
            key={e.zone}
            disabled={!e.enabled}
            onClick={() => e.enabled && onPick(e.zone)}
            title={e.enabled ? undefined : '敬请期待'}
            className={`group flex flex-col items-start gap-2 p-4 rounded-xl border transition-colors text-left ${
              e.enabled
                ? 'border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-stone-800 dark:text-stone-100 cursor-pointer'
                : 'border-black/5 dark:border-white/5 text-stone-400 dark:text-stone-600 cursor-not-allowed'
            }`}
          >
            <span className="shrink-0">{e.icon}</span>
            <div className="min-w-0">
              <div className="text-[15px] font-medium leading-tight">{e.label}</div>
              <div className="text-[12px] mt-0.5 text-stone-500 dark:text-stone-400 leading-tight">
                {e.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
