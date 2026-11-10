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
      <span className="mr-1 w-16 shrink-0 text-xs font-semibold text-ink-3">{label}</span>
      <Chip active={selected.length === 0} onClick={() => onChange([])}>
        All
      </Chip>
      {options.map((o) => (
        <Chip key={o.value} active={selected.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-xs tabular-nums opacity-60">{o.count}</span>}
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
        "h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 xl:h-9",
        active
          ? "border-white/[0.16] bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-border bg-transparent text-ink-3 hover:border-border-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
