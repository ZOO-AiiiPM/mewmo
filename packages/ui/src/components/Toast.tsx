"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ToastProps {
  message: string;
  type: "info" | "success" | "error";
  duration?: number;
  onDismiss?: () => void;
}

export function Toast({ message, type, duration = 3000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  const typeClasses = {
    info: "bg-paper-2 border-line text-ink",
    success: "bg-moss-2 border-moss/30 text-ink",
    error: "bg-coral/10 border-coral/30 text-coral",
  };
  const mark = type === "error" ? "!" : type === "success" ? "✓" : null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border px-4 py-3 text-sm shadow-float animate-in slide-in-from-bottom-2 ${typeClasses[type]}`}
    >
      {mark ? (
        <span className="grid h-4 w-4 place-items-center text-xs font-black" aria-hidden="true">
          {mark}
        </span>
      ) : null}
      <span>{message}</span>
    </div>
  );
}

interface ToastContainerProps {
  children: ReactNode;
}

export function ToastContainer({ children }: ToastContainerProps) {
  return <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">{children}</div>;
}
