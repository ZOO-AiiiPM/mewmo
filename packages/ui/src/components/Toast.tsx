"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ToastProps {
  message: string;
  type?: "info" | "success" | "error";
  duration?: number;
  onDismiss?: () => void;
}

export function Toast({ message, type = "info", duration = 3000, onDismiss }: ToastProps) {
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

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-md border px-4 py-3 text-sm shadow-float animate-in slide-in-from-bottom-2 ${typeClasses[type]}`}
    >
      {message}
    </div>
  );
}

interface ToastContainerProps {
  children: ReactNode;
}

export function ToastContainer({ children }: ToastContainerProps) {
  return <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">{children}</div>;
}
