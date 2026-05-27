import * as ContextMenu from '@radix-ui/react-context-menu';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
};

/** 列表项右键菜单（紧凑、统一样式）。当前只挂删除项，未来可扩展更多 Item 槽。
 *  尺寸基线：menu min-w-[140px] / p-1，item py-1.5 px-2.5 text-[13px] / icon 14px / rounded-md。 */
export function ListItemContextMenu({ children, onDelete, deleteLabel = '删除' }: Props) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[140px] p-1 rounded-xl bg-white dark:bg-stone-800 ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-50"
        >
          <ContextMenu.Item
            onSelect={onDelete}
            className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-red-600 dark:text-red-400 rounded-md outline-none cursor-pointer data-[highlighted]:bg-red-500/10 dark:data-[highlighted]:bg-red-500/15 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>{deleteLabel}</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
