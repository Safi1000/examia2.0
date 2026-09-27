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
    <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/40 bg-brand-soft/70 px-3 py-2 backdrop-blur">
      <span className="text-sm font-semibold text-ink">
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

/** Square tick box used to select a row. */
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
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--brand)]"
    />
  );
}
