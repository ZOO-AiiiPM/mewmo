import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listKbContents, listKbs } from '../lib/kb';
import type { KbFolderEntry, KnowledgeBase } from '../types';

// KB 封面色 → hex（与 KnowledgeBase.tsx 的 LibraryFolderIcon 配色一致，保持知识库一等身份）
const KB_COVER: Record<string, string> = {
  blue: '#60a5fa',
  amber: '#fbbf24',
  emerald: '#34d399',
  violet: '#a78bfa',
  rose: '#f43f5e',
};
const coverColor = (color: string): string => KB_COVER[color] ?? '#60a5fa';

type Props = {
  open: boolean;
  /** 被移动项标题（标题栏展示） */
  itemLabel: string;
  /** 被移动项当前所在库 dir_name */
  sourceKb: string;
  /** 当前所在文件夹相对路径（'' = 库根）；移动到这里是 no-op → 禁用 */
  sourceParentPath: string;
  /** 若正在移动文件夹，其在 sourceKb 中的 path；禁用它自身及子树作为目标 */
  movingFolderPath?: string;
  /** 选定目标：targetKb + targetRelativePath（'' = 库根） */
  onPick: (targetKb: string, targetRelativePath: string) => void;
  onCancel: () => void;
};

function FolderGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function MoveTargetPicker({
  open,
  itemLabel,
  sourceKb,
  sourceParentPath,
  movingFolderPath,
  onPick,
  onCancel,
}: Props) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenByKey, setChildrenByKey] = useState<Record<string, KbFolderEntry[]>>({});

  const nodeKey = (kb: string, path: string) => `${kb}::${path}`;

  // 打开时拉取 KB 列表并重置展开/缓存
  useEffect(() => {
    if (!open) return;
    setExpanded(new Set());
    setChildrenByKey({});
    listKbs().then(setKbs).catch(console.error);
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  const loadChildren = useCallback(
    async (kb: string, path: string) => {
      const key = nodeKey(kb, path);
      try {
        const data = await listKbContents(kb, path === '' ? undefined : path);
        setChildrenByKey(prev => ({ ...prev, [key]: data.folders }));
      } catch (e) {
        console.error(e);
      }
    },
    []
  );

  const toggle = useCallback(
    (kb: string, path: string) => {
      const key = nodeKey(kb, path);
      setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
          if (!childrenByKey[key]) loadChildren(kb, path);
        }
        return next;
      });
    },
    [childrenByKey, loadChildren]
  );

  // 目标是否非法：当前位置（no-op）或被移动文件夹自身/子树
  const isDisabled = (kb: string, path: string): boolean => {
    if (kb === sourceKb && path === sourceParentPath) return true;
    if (
      movingFolderPath &&
      kb === sourceKb &&
      (path === movingFolderPath || path.startsWith(`${movingFolderPath}/`))
    ) {
      return true;
    }
    return false;
  };

  // 递归渲染某节点下的子文件夹
  const renderFolders = (kb: string, parentPath: string, depth: number) => {
    const key = nodeKey(kb, parentPath);
    const folders = childrenByKey[key];
    if (!expanded.has(key) || !folders) return null;
    return folders.map(f => {
      const fkey = nodeKey(kb, f.path);
      const disabled = isDisabled(kb, f.path);
      const isExpanded = expanded.has(fkey);
      return (
        <div key={fkey}>
          <div className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
            <button
              type="button"
              onClick={() => toggle(kb, f.path)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              aria-label="展开"
            >
              <Chevron open={isExpanded} />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(kb, f.path)}
              className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                disabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
              }`}
            >
              <span className="shrink-0 text-stone-400 dark:text-stone-500">
                <FolderGlyph />
              </span>
              <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-stone-200">{f.name}</span>
            </button>
          </div>
          {renderFolders(kb, f.path, depth + 1)}
        </div>
      );
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onMouseDown={e => {
            if (e.target === e.currentTarget) onCancel();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="flex max-h-[70vh] w-[400px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-stone-800 dark:ring-white/10"
          >
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-[14px] font-semibold text-stone-900 dark:text-stone-50">移动到…</h2>
              <p className="mt-1 truncate text-[12px] text-stone-500 dark:text-stone-400">
                {itemLabel}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
              {kbs.map(kb => {
                const rootKey = nodeKey(kb.dir_name, '');
                const isExpanded = expanded.has(rootKey);
                const disabled = isDisabled(kb.dir_name, '');
                return (
                  <div key={kb.dir_name}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => toggle(kb.dir_name, '')}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                        aria-label="展开"
                      >
                        <Chevron open={isExpanded} />
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onPick(kb.dir_name, '')}
                        className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                          disabled
                            ? 'cursor-not-allowed opacity-40'
                            : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span
                          className="h-4 w-3 shrink-0 rounded-[2px]"
                          style={{ background: coverColor(kb.color) }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-stone-800 dark:text-stone-100">
                          {kb.name}
                        </span>
                      </button>
                    </div>
                    {renderFolders(kb.dir_name, '', 1)}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/5 bg-stone-50 px-5 py-3 dark:border-white/5 dark:bg-stone-900/50">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md px-3.5 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:bg-black/[0.05] dark:text-stone-200 dark:hover:bg-white/[0.06]"
              >
                取消
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
