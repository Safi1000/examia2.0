"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  // If nothing matches `active`, the first tab still takes keyboard focus.
  const focusId = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;

  // Arrow keys, Home and End move focus between tabs; Enter or Space opens the
  // focused one. Moving alone never switches, because some tab sets change the
  // page under them (the archive tabs hide themselves on "Current").
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    if (!buttons.length) return;
    const at = Math.max(0, buttons.indexOf(document.activeElement as HTMLElement));
    const next =
      e.key === "Home" ? 0
      : e.key === "End" ? buttons.length - 1
      : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    e.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Sections"
      onKeyDown={onKeyDown}
      className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}
    >
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={t.id === focusId ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative min-h-11 whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition-colors",
              selected ? "text-brand" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-bold",
                  selected ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-3",
                )}
              >
                {t.count}
              </span>
            )}
            {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}
