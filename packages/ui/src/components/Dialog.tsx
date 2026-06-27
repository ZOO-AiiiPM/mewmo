"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-ink/40 bg-paper rounded-lg border border-line shadow-float p-0 max-w-md w-full"
    >
      <div className="p-5">
        {title && (
          <h2 className="text-lg font-semibold text-ink mb-3">{title}</h2>
        )}
        {children}
      </div>
    </dialog>
  );
}
