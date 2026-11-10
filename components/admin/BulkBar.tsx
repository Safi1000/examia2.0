"use client";

import { Button } from "@/components/ui";

/**
 * The bar that appears once rows are ticked.
 *
 * Deliberately dumb: it knows how many are selected and renders whatever
 * actions the list hands it, so a new bulk action is a button, not a feature.
 */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  noun: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-[4.5rem] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-strong bg-surface-2/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_28px_-14px_rgba(0,0,0,0.7)] backdrop-blur animate-fade-up">
      <span className="pl-1 text-sm font-semibold tabular-nums text-ink">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

/**
 * Square tick box used to select a row: quiet when off, off-white when on (gold
 * stays for the action). The hit area reaches 44px without moving the layout.
 */
export function RowCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex h-5 w-5 shrink-0 cursor-pointer before:absolute before:-inset-3 before:content-['']">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={
          "flex h-5 w-5 items-center justify-center rounded-[6px] border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand " +
          (checked ? "border-ink/80 bg-ink text-paper" : "border-border-strong bg-surface hover:border-ink-3")
        }
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}
