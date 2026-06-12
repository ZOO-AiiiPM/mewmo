import type React from 'react';

export type Zone = 'subscribe' | 'notes' | 'clipping' | 'sediment';

type Props = {
  open: boolean;
  onToggle: () => void;
  active: Zone | null;
  onSelect: (zone: Zone) => void;
  counts?: Partial<Record<Zone, number>>;
  hidden?: boolean;
  onSearchClick: () => void;
  onSettingsClick: () => void;
};

const icons = {
  subscribe: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  ),
  notes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  ),
  clipping: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  ),
  sediment: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.91a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  collapse: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  ),
  expand: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  ),
  moon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  sun: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const NAV: Array<{ id: Zone; label: string }> = [
  { id: 'subscribe', label: '订阅' },
  { id: 'notes', label: '笔记' },
  { id: 'clipping', label: '剪藏' },
  { id: 'sediment', label: '沉淀' },
];

export function Sidebar({ open, onToggle, active, onSelect, counts = {}, hidden = false, onSearchClick, onSettingsClick }: Props) {
  return (
    <aside
      style={{ width: hidden ? 0 : (open ? undefined : 48) }}
      className={`shrink-0 flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${
        !hidden && open ? 'w-[168px]' : ''
      }`}
    >
      {/* 顶部条：高度对齐顶部 toolbar (h-12)。折叠态走 px-0.5 + px-3 py-3 同 nav 节奏，按钮 44×44 居中 */}
      {open ? (
        <div className="shrink-0 h-12 flex items-center px-3 gap-2">
          <img
            src="/logo.png"
            alt="mewmo"
            className="w-7 h-7 rounded-lg select-none shrink-0 ring-1 ring-black/5 dark:ring-white/10 dark:invert"
          />
          <span className="flex-1 min-w-0 text-[15px] font-bold text-stone-900 dark:text-stone-100 select-none truncate">
            mewmo
          </span>
          <button
            onClick={onToggle}
            title="折叠侧栏"
            className="w-7 h-7 grid place-items-center rounded-lg text-stone-700 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors shrink-0"
          >
            {icons.collapse}
          </button>
        </div>
      ) : (
        <div className="shrink-0 h-12 px-0.5 flex items-center">
          <button
            onClick={onToggle}
            title="展开侧栏"
            className="w-full flex items-center justify-center px-3 py-3 rounded-lg text-stone-700 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
          >
            {icons.expand}
          </button>
        </div>
      )}

      {/* 搜索：点击触发 SearchOverlay 弹窗（不在 sidebar 内编辑）*/}
      <div className="px-0.5">
        {open ? (
          <button
            onClick={onSearchClick}
            title="搜索 (⌘K)"
            className="w-full flex items-center gap-2 px-3 py-3 rounded-lg bg-black/[0.06] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] transition-colors text-left"
          >
            <span className="shrink-0 text-stone-800 dark:text-stone-200">{icons.search}</span>
            <span className="flex-1 text-[14px] font-medium text-stone-500 dark:text-stone-400 select-none">搜索</span>
            <kbd className="text-[10px] font-semibold tracking-wider text-stone-500 dark:text-stone-400 bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5 rounded select-none">⌘K</kbd>
          </button>
        ) : (
          <button
            onClick={onSearchClick}
            title="搜索 (⌘K)"
            className="w-full flex items-center gap-2 px-3 py-3 rounded-lg text-stone-800 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
          >
            <span className="shrink-0">{icons.search}</span>
          </button>
        )}
      </div>

      {/* 导航：与 search 之间 mt-0.5(2px)。所有相邻 icon center-to-center = 44+2 = 46px，header 也命中（h-12/2 + 44/2 = 24+22 = 46）*/}
      <nav className="flex-1 overflow-y-auto mt-0.5 space-y-0.5 px-0.5">
        {NAV.map(item => (
          <NavItem
            key={item.id}
            active={active === item.id}
            icon={icons[item.id]}
            label={item.label}
            count={counts[item.id] ?? 0}
            collapsed={!open}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </nav>

      {/* 底部设置按钮 */}
      <div className="pt-0.5 px-0.5 pb-2 border-t border-black/5 dark:border-white/5">
        <button
          onClick={onSettingsClick}
          title="设置"
          className="w-full flex items-center gap-2 px-3 py-3 rounded-lg text-stone-700 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
        >
          <span className="shrink-0">
            {icons.settings}
          </span>
          {open && (
            <span className="text-[14px] font-medium truncate">
              设置
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  active,
  icon,
  label,
  count,
  collapsed,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-2 px-3 py-3 rounded-lg text-left transition-colors ${
        active
          ? 'bg-black/[0.06] dark:bg-white/[0.08] text-stone-900 dark:text-stone-50'
          : 'text-stone-800 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 text-[14px] font-medium truncate">{label}</span>
          {count > 0 && (
            <span className="text-[12px] font-medium text-stone-500 dark:text-stone-400 tabular-nums shrink-0">
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}
