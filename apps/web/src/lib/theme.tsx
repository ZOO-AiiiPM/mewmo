"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
type ReaderFont = "sans" | "serif" | "mono";
type ReaderFontSize = "small" | "default" | "large";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
  accent: string;
  setAccent: (accent: string) => void;
  readerFont: ReaderFont;
  setReaderFont: (font: ReaderFont) => void;
  readerFontSize: ReaderFontSize;
  setReaderFontSize: (size: ReaderFontSize) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  resolved: "dark",
  accent: "",
  setAccent: () => {},
  readerFont: "sans",
  setReaderFont: () => {},
  readerFontSize: "default",
  setReaderFontSize: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

function applyAccentColor(accent: string) {
  const root = document.documentElement;
  if (!accent) {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-ink");
    root.style.removeProperty("--accent-2");
    root.style.removeProperty("--hl");
    return;
  }

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-ink", "#fff");
  root.style.setProperty("--accent-2", `color-mix(in srgb, ${accent} 14%, transparent)`);
  root.style.setProperty("--hl", `color-mix(in srgb, ${accent} 22%, transparent)`);
}

function readerFontValue(font: ReaderFont) {
  if (font === "serif") return "var(--serif)";
  if (font === "mono") return "var(--mono)";
  return "var(--ui)";
}

function readerFontSizeValue(size: ReaderFontSize) {
  if (size === "small") return "14px";
  if (size === "large") return "17px";
  return "15.5px";
}

function applyReaderTypography(font: ReaderFont, size: ReaderFontSize) {
  const root = document.documentElement;
  root.style.setProperty("--reader-font", readerFontValue(font));
  root.style.setProperty("--reader-font-size", readerFontSizeValue(size));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");
  const [accent, setAccentState] = useState("");
  const [readerFont, setReaderFontState] = useState<ReaderFont>("sans");
  const [readerFontSize, setReaderFontSizeState] = useState<ReaderFontSize>("default");

  useEffect(() => {
    const stored = localStorage.getItem("mewmo-theme") as Theme | null;
    if (stored && ["light", "dark", "system"].includes(stored)) {
      setThemeState(stored);
    }
    const storedAccent = localStorage.getItem("mewmo-accent");
    if (storedAccent !== null) {
      setAccentState(storedAccent);
    }
    const storedReaderFont = localStorage.getItem("mewmo-reader-font") as ReaderFont | null;
    if (storedReaderFont && ["sans", "serif", "mono"].includes(storedReaderFont)) {
      setReaderFontState(storedReaderFont);
    }
    const storedReaderFontSize = localStorage.getItem("mewmo-reader-font-size") as ReaderFontSize | null;
    if (storedReaderFontSize && ["small", "default", "large"].includes(storedReaderFontSize)) {
      setReaderFontSizeState(storedReaderFontSize);
    }
  }, []);

  useEffect(() => {
    const r = theme === "system" ? getSystemTheme() : theme;
    setResolved(r);
    applyTheme(r);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = getSystemTheme();
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("mewmo-theme", t);
  }, []);

  useEffect(() => {
    applyAccentColor(accent);
  }, [accent]);

  const setAccent = useCallback((accent: string) => {
    setAccentState(accent);
    localStorage.setItem("mewmo-accent", accent);
  }, []);

  useEffect(() => {
    applyReaderTypography(readerFont, readerFontSize);
  }, [readerFont, readerFontSize]);

  const setReaderFont = useCallback((font: ReaderFont) => {
    setReaderFontState(font);
    localStorage.setItem("mewmo-reader-font", font);
  }, []);

  const setReaderFontSize = useCallback((size: ReaderFontSize) => {
    setReaderFontSizeState(size);
    localStorage.setItem("mewmo-reader-font-size", size);
  }, []);

  return (
    <ThemeContext
      value={{
        theme,
        setTheme,
        resolved,
        accent,
        setAccent,
        readerFont,
        setReaderFont,
        readerFontSize,
        setReaderFontSize,
      }}
    >
      {children}
    </ThemeContext>
  );
}
