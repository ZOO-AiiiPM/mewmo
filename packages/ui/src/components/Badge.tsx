import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "moss" | "coral" | "muted";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-paper-2 text-ink border-line",
  moss: "bg-moss-2 text-moss border-moss/20",
  coral: "bg-coral/10 text-coral border-coral/20",
  muted: "bg-paper-2 text-muted border-line",
};

export function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
