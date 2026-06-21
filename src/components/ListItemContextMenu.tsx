import * as ContextMenu from '@radix-ui/react-context-menu';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  onPin?: () => void;
  pinLabel?: string;
  onReveal?: () => void;
};

export function ListItemContextMenu({ children, onDelete, deleteLabel = '删除', onPin, pinLabel = '置顶', onReveal }: Props) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[140px] p-1 rounded-xl bg-white dark:bg-stone-800 shadow-[0_8px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-50"
        >
          {onPin && (
            <ContextMenu.Item
              onSelect={onPin}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-stone-700 dark:text-stone-200 rounded-md outline-none cursor-pointer data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
              <span>{pinLabel}</span>
            </ContextMenu.Item>
          )}
          {onReveal && (
            <ContextMenu.Item
              onSelect={onReveal}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-stone-700 dark:text-stone-200 rounded-md outline-none cursor-pointer data-[highlighted]:bg-stone-100 dark:data-[highlighted]:bg-stone-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span>导出笔记</span>
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            onSelect={onDelete}
            className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-red-600 dark:text-red-400 rounded-md outline-none cursor-pointer data-[highlighted]:bg-red-500 data-[highlighted]:text-white dark:data-[highlighted]:bg-red-500 dark:data-[highlighted]:text-white transition-colors"
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
