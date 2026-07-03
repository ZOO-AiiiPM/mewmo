"use client";

import type { ReactNode } from "react";

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
  if (!open) return null;

  return (
    <div className="mewmo-confirm" role="dialog" aria-modal="true" aria-labelledby="mewmo-confirm-title">
      <button className="mewmo-confirm__scrim" aria-label="Close confirmation" onClick={onCancel} />
      <div className="mewmo-confirm__panel">
        <h2 id="mewmo-confirm-title">{title}</h2>
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
