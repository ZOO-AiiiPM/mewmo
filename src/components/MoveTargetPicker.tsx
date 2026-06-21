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

type Selected = { kb: string; path: string };

type Props = {
  open: boolean;
  /** 被移动项标题（保留给调用方，不在 UI 显示） */
  itemLabel?: string;
  /** 被移动项当前所在库 dir_name */
  sourceKb: string;
  /** 当前所在文件夹相对路径（'' = 库根）；移动到这里是 no-op → 不可选 */
  sourceParentPath: string;
  /** 若正在移动文件夹，其在 sourceKb 中的 path；禁用它自身及子树作为目标 */
  movingFolderPath?: string;
  /** 点「确定」后回调：targetKb + targetRelativePath（'' = 库根） */
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
  sourceKb,
  sourceParentPath,
  movingFolderPath,
  onPick,
  onCancel,
}: Props) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [childrenByKey, setChildrenByKey] = useState<Record<string, KbFolderEntry[]>>({});
  const [selected, setSelected] = useState<Selected | null>(null);

  const nodeKey = (kb: string, path: string) => `${kb}::${path}`;

  const loadChildren = useCallback(async (kb: string, path: string) => {
    const key = nodeKey(kb, path);
    try {
      const data = await listKbContents(kb, path === '' ? undefined : path);
      setChildrenByKey(prev => ({ ...prev, [key]: data.folders }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 打开时拉 KB 列表 + 重置；当前库的文件夹直接展开列出（不显示库节点本身）
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setChildrenByKey({});
    setExpanded(new Set([nodeKey(sourceKb, '')]));
    listKbs().then(setKbs).catch(console.error);
    loadChildren(sourceKb, '');
  }, [open, sourceKb, loadChildren]);

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

  // chevron / 行点击：切换展开/折叠
  const toggleExpand = useCallback(
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

  // 行点击：可选则选中；可展开则切换展开/折叠（点文件夹展开，再点折叠）
  const onRowClick = (kb: string, path: string, disabled: boolean, canExpand: boolean) => {
    if (!disabled) setSelected({ kb, path });
    if (canExpand) toggleExpand(kb, path);
  };

  const isSelected = (kb: string, path: string) => selected?.kb === kb && selected?.path === path;

  // 黑白主题：选中用中性灰高亮，不用蓝色
  const rowClass = (kb: string, path: string, disabled: boolean) =>
    `flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
      disabled
        ? 'cursor-not-allowed opacity-40'
        : isSelected(kb, path)
          ? 'bg-black/[0.10] font-medium text-stone-900 dark:bg-white/[0.16] dark:text-stone-50'
          : 'text-stone-700 hover:bg-black/[0.05] dark:text-stone-200 dark:hover:bg-white/[0.06]'
    }`;

  // 递归渲染某节点下的子文件夹
  const renderFolders = (kb: string, parentPath: string, depth: number) => {
    const key = nodeKey(kb, parentPath);
    const folders = childrenByKey[key];
    if (!expanded.has(key) || !folders) return null;
    return folders.map(f => {
      const disabled = isDisabled(kb, f.path);
      const isExpanded = expanded.has(nodeKey(kb, f.path));
      return (
        <div key={nodeKey(kb, f.path)}>
          <div className="flex items-center" style={{ paddingLeft: `${depth * 16}px` }}>
            {f.has_subfolders ? (
              <button
                type="button"
                onClick={() => toggleExpand(kb, f.path)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                aria-label="展开"
              >
                <Chevron open={isExpanded} />
              </button>
            ) : (
              // 叶子文件夹：无子文件夹，不显示折叠三角，占位保持对齐
              <span className="h-6 w-6 shrink-0" />
            )}
            <button type="button" disabled={disabled} onClick={() => onRowClick(kb, f.path, disabled, f.has_subfolders)} className={rowClass(kb, f.path, disabled)}>
              <span className="shrink-0 text-stone-400 dark:text-stone-500">
                <FolderGlyph />
              </span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </button>
          </div>
          {renderFolders(kb, f.path, depth + 1)}
        </div>
      );
    });
  };

  // 渲染一个 KB 节点（书本封面色 + 名字）+ 其展开的文件夹 —— 仅「其他知识库」用
  const renderKbNode = (kb: KnowledgeBase) => {
    const disabled = isDisabled(kb.dir_name, '');
    const isExpanded = expanded.has(nodeKey(kb.dir_name, ''));
    return (
      <div key={kb.dir_name}>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => toggleExpand(kb.dir_name, '')}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
            aria-label="展开"
          >
            <Chevron open={isExpanded} />
          </button>
          <button type="button" disabled={disabled} onClick={() => onRowClick(kb.dir_name, '', disabled, true)} className={rowClass(kb.dir_name, '', disabled)}>
            <span className="h-4 w-3 shrink-0 rounded-[2px]" style={{ background: coverColor(kb.color) }} />
            <span className="min-w-0 flex-1 truncate">{kb.name}</span>
          </button>
        </div>
        {renderFolders(kb.dir_name, '', 1)}
      </div>
    );
  };

  const otherKbs = kbs.filter(k => k.dir_name !== sourceKb);
  const currentFolders = childrenByKey[nodeKey(sourceKb, '')];

  const confirm = () => {
    if (selected && !isDisabled(selected.kb, selected.path)) {
      onPick(selected.kb, selected.path);
    }
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
            className="flex h-[520px] max-h-[85vh] w-[400px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-stone-800 dark:ring-white/10"
          >
            <div className="px-5 pb-1 pt-5">
              <h2 className="text-[16px] font-semibold text-stone-900 dark:text-stone-100">移动文件/文件夹至</h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
                当前知识库
              </div>
              {renderFolders(sourceKb, '', 0)}
              {currentFolders && currentFolders.length === 0 && (
                <div className="px-3 py-1.5 text-[12px] text-stone-400 dark:text-stone-500">暂无文件夹</div>
              )}

              {otherKbs.length > 0 && (
                <>
                  <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
                    其他知识库
                  </div>
                  {otherKbs.map(renderKbNode)}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/5 bg-stone-50 px-5 py-3 dark:border-white/5 dark:bg-stone-900/50">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md px-3.5 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:bg-black/[0.05] dark:text-stone-200 dark:hover:bg-white/[0.06]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={confirm}
                className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  selected
                    ? 'bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white'
                    : 'cursor-not-allowed bg-stone-200 text-stone-400 dark:bg-stone-700 dark:text-stone-500'
                }`}
              >
                确定
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
