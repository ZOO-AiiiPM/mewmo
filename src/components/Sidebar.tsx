import type React from 'react';

export type Zone = 'subscribe' | 'notes' | 'clipping' | 'sediment';

type Props = {
  open: boolean;
  onToggle: () => void;
  active: Zone | null;
  onSelect: (zone: Zone) => void;
  counts?: Partial<Record<Zone, number>>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
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
};

const NAV: Array<{ id: Zone; label: string }> = [
  { id: 'subscribe', label: '订阅' },
  { id: 'notes', label: '笔记' },
  { id: 'clipping', label: '剪藏' },
  { id: 'sediment', label: '沉淀' },
];

export function Sidebar({ open, onToggle, active, onSelect, counts = {}, theme, onToggleTheme }: Props) {
  return (
    <aside
      style={{ width: open ? undefined : 48 }}
      className={`shrink-0 flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${
        open ? 'w-56' : ''
      }`}
    >
      {/* 顶部条：高度对齐顶部 toolbar (h-12)；折叠态 48x48 方角 */}
      <div className="shrink-0 h-12 flex items-center px-3 gap-2">
        {open && (
          <>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-stone-800 to-stone-950 dark:from-stone-100 dark:to-stone-300 flex items-center justify-center text-white dark:text-stone-900 select-none shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 3 14 C 5 8, 8 8, 10 13 S 13 19, 15 14 S 19 9, 21 12" />
              </svg>
            </div>
            <span className="flex-1 min-w-0 text-[15px] font-bold text-stone-900 dark:text-stone-100 select-none truncate">
              vibe 笔记
            </span>
          </>
        )}
        <button
          onClick={onToggle}
          title={open ? '折叠侧栏' : '展开侧栏'}
          className="w-7 h-7 grid place-items-center rounded-lg text-stone-700 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors shrink-0"
        >
          {open ? icons.collapse : icons.expand}
        </button>
      </div>

      {/* 搜索：与 nav item 同构（容器 px-2 左右等距、按钮 w-full px-2 py-2.5、icon x=16 对齐）*/}
      <div className="mb-2 px-2">
        {open ? (
          <div className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]">
            <span className="shrink-0 text-stone-800 dark:text-stone-200">{icons.search}</span>
            <input
              type="text"
              placeholder="搜索"
              className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:outline-none"
            />
          </div>
        ) : (
          <button
            title="搜索"
            className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-stone-800 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
          >
            <span className="shrink-0">{icons.search}</span>
          </button>
        )}
      </div>

      {/* 导航：容器在两态完全一致，NavItem 通过 w-full 自然跟随 sidebar 宽度变化 */}
      <nav className="flex-1 overflow-y-auto py-1 space-y-0.5 px-2">
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

      {/* 底部主题切换：容器在两态完全一致 */}
      <div className="p-2 border-t border-black/5 dark:border-white/5">
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-stone-700 dark:text-stone-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
        >
          <span className="shrink-0">
            {theme === 'dark' ? icons.sun : icons.moon}
          </span>
          {open && (
            <span className="text-[14px] font-medium truncate">
              {theme === 'dark' ? '浅色' : '深色'}
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
      className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left transition-colors ${
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
            <span className="text-[12px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}
