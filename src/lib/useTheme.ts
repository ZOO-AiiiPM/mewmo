import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'vibe-theme';

function getInitial(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(STORAGE_KEY, theme);

    // 同步到 Tauri 窗口 NSAppearance —— 这样 vibrancy material 才会跟随切换深浅
    try {
      getCurrentWindow().setTheme(theme).catch(() => {});
    } catch {
      // Tauri API 还没注入（getCurrentWindow 同步 throw）—— 忽略，等下次 effect
    }
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
}
