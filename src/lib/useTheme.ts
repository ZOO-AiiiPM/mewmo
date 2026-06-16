import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'vibe-theme';

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(mode));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    setTheme(resolve(mode));
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');

    try {
      getCurrentWindow().setTheme(theme).catch(() => {});
    } catch { /* Tauri API unavailable in browser preview */ }
  }, [theme]);

  const toggle = () => setMode(m => (m === 'dark' ? 'light' : m === 'light' ? 'dark' : 'light'));

  return { theme, mode, setMode, toggle };
}
