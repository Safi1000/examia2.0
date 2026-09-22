"use client";

import { cn } from "@/lib/cn";

/**
 * Multi-select filter row. Nothing selected means "all" — the same as the
 * dropdowns these replaced, so an empty selection never hides everything.
 */
export function FilterChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (!options.length) return null;
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      <Chip active={selected.length === 0} onClick={() => onChange([])}>
        All
      </Chip>
      {options.map((o) => (
        <Chip key={o.value} active={selected.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="ml-1 font-mono text-xs opacity-70">{o.count}</span>}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors",
        active
          ? "border-brand bg-brand text-on-brand"
          : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
