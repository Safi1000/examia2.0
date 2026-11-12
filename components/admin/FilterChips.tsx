"use client";

import { chipClass } from "@/components/ui/Segmented";

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
    // Laptop and tablet: one row that wraps under its label. Phone: one line that
    // scrolls sideways to the screen edge, so a long list never stacks three rows deep.
    <div
      className="flex items-center gap-1.5 max-sm:-mx-5 max-sm:overflow-x-auto max-sm:px-5 max-sm:[scrollbar-width:none] sm:flex-wrap max-sm:[&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label={label}
    >
      <span className="mr-1 w-16 shrink-0 text-xs font-semibold text-ink-3">{label}</span>
      <Chip active={selected.length === 0} onClick={() => onChange([])}>
        All
      </Chip>
      {options.map((o) => (
        <Chip key={o.value} active={selected.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="text-xs tabular-nums opacity-60">{o.count}</span>}
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
      className={chipClass(active)}
    >
      {children}
    </button>
  );
}
