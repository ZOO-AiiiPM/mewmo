import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = "", id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition-colors focus:border-moss focus:ring-1 focus:ring-moss ${error ? "border-coral" : ""} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-coral">{error}</span>}
    </div>
  );
}
