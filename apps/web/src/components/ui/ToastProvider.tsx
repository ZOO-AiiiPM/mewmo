"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "loading" | "error";

interface ToastState {
  id: number;
  text: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (text: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((text: string, type: ToastType = "success") => {
    setToast({ id: Date.now(), text, type });
  }, []);

  useEffect(() => {
    if (!toast || toast.type === "loading") return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext value={value}>
      {children}
      <div className={`mewmo-toast ${toast ? "mewmo-toast--on" : ""}`} role="status" aria-live="polite">
        {toast && (
          <div className={`mewmo-toast__inner mewmo-toast__inner--${toast.type}`}>
            {toast.type === "loading" ? (
              <span className="mewmo-toast__spin" aria-hidden="true" />
            ) : (
              <span className="mewmo-toast__mark" aria-hidden="true">
                {toast.type === "success" ? "✓" : "!"}
              </span>
            )}
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
