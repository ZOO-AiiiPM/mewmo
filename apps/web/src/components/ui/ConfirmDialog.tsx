"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PrototypeIcon } from "../shell/PrototypeIcon";

const MODAL_EXIT_MS = 160;

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    const timer = window.setTimeout(() => setMounted(false), MODAL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, open]);

  if (!mounted) return null;

  return (
    <div
      className="mewmo-confirm"
      data-state={open ? "open" : "closed"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mewmo-confirm-title"
    >
      <button className="mewmo-confirm__scrim" aria-label="Close confirmation" onClick={onCancel} />
      <div className="mewmo-confirm__panel">
        <div className="mewmo-confirm__head">
          <h2 id="mewmo-confirm-title">{title}</h2>
          <button type="button" className="mewmo-confirm__close" aria-label="关闭" onClick={onCancel}>
            <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
          </button>
        </div>
        {description && <p>{description}</p>}
        {children}
        <div className="mewmo-confirm__actions">
          <button type="button" className="mewmo-button mewmo-button--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="mewmo-button mewmo-button--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
