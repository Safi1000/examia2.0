"use client";

import { cn } from "@/lib/cn";

/** A large, tappable MCQ-style radio row (≥48px target, stacked on mobile). */
export function RadioCard({
  name,
  checked,
  onChange,
  label,
  disabled,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[52px] items-center gap-3 rounded-md border px-4 py-3 transition-colors",
        // The real radio is visually hidden, so the card shows the keyboard focus ring.
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        checked
          ? "border-brand bg-brand-soft"
          : "border-border-strong bg-surface hover:border-brand/50 hover:bg-surface-2",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          checked ? "border-brand" : "border-border-strong",
        )}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
      </span>
      <span className="text-base leading-snug text-ink">{label}</span>
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("group/check inline-flex items-center gap-2.5", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", className)}>
      <span
        className={cn(
          // The real checkbox is visually hidden, so the box shows the keyboard focus ring.
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
          "group-has-[:focus-visible]/check:outline-2 group-has-[:focus-visible]/check:outline-offset-2 group-has-[:focus-visible]/check:outline-brand",
          checked ? "border-brand bg-brand" : "border-border-strong bg-surface",
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-on-brand" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {label && <span className="text-sm text-ink">{label}</span>}
    </label>
  );
}
