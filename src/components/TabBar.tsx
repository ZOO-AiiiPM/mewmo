import { Fragment, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Zone } from './Sidebar';

export type Tab = { id: string; title: string; zone: Zone | null };

const ZONE_ICONS: Record<Zone, React.ReactNode> = {
  notes: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  ),
  clipping: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  ),
  subscribe: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  ),
  sediment: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.91a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  ),
};

type Props = {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAddNew: () => void;
};

export function TabBar({ tabs, activeId, onSelect, onClose, onAddNew }: Props) {
  const dragRegionRef = useRef<HTMLDivElement>(null);

  // 双击 toggle maximize/unmaximize。Tauri 的 data-tauri-drag-region 内置一个 native
  // dblclick handler 调 toggleMaximize（macOS 上跟 native zoom 状态不同步——「能扩大不能
  // 缩小」），跟自定义 onDoubleClick 同时跑会出现 race「先扩再缩」抖动。
  // 用 capture phase + stopImmediatePropagation 拦在内置 listener 之前，独占双击行为。
  useEffect(() => {
    const el = dragRegionRef.current;
    if (!el) return;
    const handler = async (e: MouseEvent) => {
      e.stopImmediatePropagation();
      e.preventDefault();
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    };
    el.addEventListener('dblclick', handler, { capture: true });
    return () => el.removeEventListener('dblclick', handler, { capture: true });
  }, []);

  return (
    <div
      ref={dragRegionRef}
      data-tauri-drag-region
      className="h-10 shrink-0 flex items-center pl-22 pr-3"
    >
      <div
        data-tauri-drag-region
        className="flex items-center flex-1 overflow-x-auto min-w-0 no-scrollbar"
      >
        {tabs.map((tab, i) => {
          // active tab 自带背景，左右两侧分隔符隐去避免视觉重复
          const showDivider =
            i > 0 && tab.id !== activeId && tabs[i - 1].id !== activeId;
          return (
            <Fragment key={tab.id}>
              <span
                aria-hidden="true"
                className={`shrink-0 w-0.5 h-4 bg-stone-300 dark:bg-stone-600 ${
                  showDivider ? '' : 'invisible'
                }`}
              />
              <TabPill
                tab={tab}
                active={tab.id === activeId}
                onSelect={() => onSelect(tab.id)}
                onClose={() => onClose(tab.id)}
              />
            </Fragment>
          );
        })}
        <button
          onClick={onAddNew}
          title="新建"
          className="ml-1 w-6 h-6 shrink-0 flex items-center justify-center rounded text-stone-800 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function TabPill({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: Tab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab.title]);

  // 文字溢出才加 mask：短文字完整显示不被淡边吃掉
  const fadeStyle = overflow
    ? {
        maskImage: 'linear-gradient(to right, black calc(100% - 18px), transparent)',
        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 18px), transparent)',
      }
    : undefined;

  return (
    <div
      onClick={onSelect}
      className={`group relative flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-md cursor-pointer text-[12px] font-semibold w-[160px] shrink-0 transition-colors ${
        active
          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-50 shadow-sm'
          : 'text-stone-800 dark:text-stone-200 hover:bg-black/5 dark:hover:bg-white/10'
      }`}
    >
      {tab.zone && (
        <span className="shrink-0">
          {ZONE_ICONS[tab.zone]}
        </span>
      )}
      <span
        ref={titleRef}
        style={fadeStyle}
        className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-left select-none"
      >
        {tab.title || '无标题'}
      </span>
      <button
        onClick={e => {
          e.stopPropagation();
          onClose();
        }}
        title="关闭标签"
        className={`shrink-0 flex items-center justify-center rounded text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all ${
          active ? 'w-4 h-4 opacity-100' : 'w-0 h-4 opacity-0 overflow-hidden group-hover:w-4 group-hover:opacity-100'
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
