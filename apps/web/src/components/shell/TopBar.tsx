"use client";

import { useTheme } from "../../lib/theme";

interface TopBarProps {
  title: string;
  action?: { label: string; onClick?: () => void };
}

export function TopBar({ title, action }: TopBarProps) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  return (
    <header className="h-14 flex items-center gap-4 px-6 border-b border-line bg-paper/80 backdrop-blur-xl sticky top-0 z-10">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>

      <div className="flex-1" />

      <div className="relative">
        <input
          type="search"
          placeholder="Search..."
          className="w-[200px] lg:w-[280px] rounded-md border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted outline-none focus:border-moss"
        />
      </div>

      <button
        onClick={cycleTheme}
        className="flex items-center justify-center w-8 h-8 rounded-md border border-line text-sm text-muted hover:text-ink hover:bg-paper-2 transition-colors"
        title={`Theme: ${theme}`}
      >
        {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "⚙️"}
      </button>

      {action && (
        <button
          onClick={action.onClick}
          className="px-3.5 py-1.5 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </header>
  );
}
