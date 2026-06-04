import { useEffect, useState } from 'react';
import type { ThemeMode } from '../lib/useTheme';
import { getVaultConfig } from '../lib/vault';

type Props = {
  open: boolean;
  onClose: () => void;
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
};

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

export function SettingsPanel({ open, onClose, mode, onModeChange }: Props) {
  const [vaultPath, setVaultPath] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getVaultConfig().then(c => setVaultPath(c?.vault_path ?? null));
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div className="relative w-[420px] max-h-[80vh] overflow-y-auto rounded-xl bg-white dark:bg-stone-800 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-stone-900 dark:text-stone-100">设置</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 grid place-items-center rounded-md text-stone-500 dark:text-stone-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 外观 */}
        <section className="mb-5">
          <h3 className="text-[13px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">外观</h3>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onModeChange(opt.value)}
                className={`flex-1 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  mode === opt.value
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-stone-700 dark:text-stone-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.10]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Vault */}
        <section>
          <h3 className="text-[13px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">Vault</h3>
          <div className="px-3 py-2.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-[13px] text-stone-600 dark:text-stone-300 font-mono break-all select-all">
            {vaultPath ?? '未配置'}
          </div>
        </section>
      </div>
    </div>
  );
}
