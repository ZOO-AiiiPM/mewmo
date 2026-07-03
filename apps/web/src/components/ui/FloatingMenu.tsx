"use client";

import type { ReactNode } from "react";

export function FloatingMenu({
  open,
  children,
  className = "",
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return <div className={`mewmo-floating-menu ${className}`}>{children}</div>;
}

export function FloatingMenuButton({
  children,
  danger = false,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`mewmo-floating-menu__item ${danger ? "mewmo-floating-menu__item--danger" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
