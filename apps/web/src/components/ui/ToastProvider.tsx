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

interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost";
}

interface ToastOptions {
  persistent?: boolean;
  actions?: ToastAction[];
}

interface ToastState {
  id: number;
  text: string;
  type: ToastType;
  persistent: boolean;
  actions: ToastAction[];
}

interface ToastContextValue {
  showToast: (text: string, type: ToastType, options?: ToastOptions) => void;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(
    (text: string, type: ToastType, options?: ToastOptions) => {
      setToast({
        id: Date.now(),
        text,
        type,
        persistent: options?.persistent ?? false,
        actions: options?.actions ?? [],
      });
    },
    [],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast || toast.type === "loading" || toast.persistent) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  const hasActions = Boolean(toast && toast.actions.length > 0);

  return (
    <ToastContext value={value}>
      {children}
      <div className={`mewmo-toast ${toast ? "mewmo-toast--on" : ""}`} role="status" aria-live="polite">
        {toast && (
          <div
            className={`mewmo-toast__inner mewmo-toast__inner--${toast.type}${
              hasActions ? " mewmo-toast__inner--actions" : ""
            }`}
          >
            <div className="mewmo-toast__body">
              {toast.type === "loading" ? (
                <span className="mewmo-toast__spin" aria-hidden="true" />
              ) : (
                <span className="mewmo-toast__mark" aria-hidden="true">
                  {toast.type === "success" ? "✓" : "!"}
                </span>
              )}
              <span className="mewmo-toast__message">{toast.text}</span>
            </div>
            {hasActions && (
              <div className="mewmo-toast__actions">
                {toast.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={`mewmo-toast__action mewmo-toast__action--${action.variant ?? "ghost"}`}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
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
