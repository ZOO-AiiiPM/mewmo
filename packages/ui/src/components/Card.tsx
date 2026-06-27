import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({ children, padding = "md", className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-line bg-paper shadow-panel ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
