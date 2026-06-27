import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = "", id, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={`w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none transition-colors focus:border-moss focus:ring-1 focus:ring-moss resize-y min-h-20 ${error ? "border-coral" : ""} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-coral">{error}</span>}
    </div>
  );
}
