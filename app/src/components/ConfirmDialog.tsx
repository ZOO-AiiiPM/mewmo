import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** confirm 按钮高亮配色：danger（红）/ primary（蓝） */
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  variant = 'primary',
  onConfirm,
  onCancel,
}: Props) {
  // ESC 关闭、Enter 确认（无障碍 / 习惯）
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel, onConfirm]);

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-500 hover:bg-red-600 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white';

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
            className="min-w-[340px] max-w-[440px] bg-white dark:bg-stone-800 rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          >
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-[15px] font-semibold text-stone-900 dark:text-stone-50">
                {title}
              </h2>
              {description && (
                <p className="mt-1.5 text-[13px] text-stone-600 dark:text-stone-400 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-stone-50 dark:bg-stone-900/50 border-t border-black/5 dark:border-white/5">
              <button
                onClick={onCancel}
                className="px-3.5 py-1.5 text-[13px] font-medium rounded-md text-stone-700 dark:text-stone-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-colors ${confirmClass}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
