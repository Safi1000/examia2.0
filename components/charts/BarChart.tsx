"use client";

import { cn } from "@/lib/cn";

export interface Bar {
  label: string;
  value: number;
  /** semantic role → token color */
  role?: "brand" | "success" | "warning" | "error" | "info";
}

const roleBg: Record<NonNullable<Bar["role"]>, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

/**
 * Vertical bar chart (e.g. grade distribution A–F). CSS-driven heights so the
 * bars grow in on first paint. Hand-rolled, no chart library.
 */
export function BarChart({ bars, height = 180, label }: { bars: Bar[]; height?: number; label?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Says what the bars show, not just "Bar chart".
  const summary = bars.map((b) => `${b.label}: ${b.value}`).join(", ");
  return (
    <div className="flex gap-2" style={{ height }} role="img" aria-label={label ? `${label}. ${summary}` : summary}>
      {bars.map((b) => {
        const pct = (b.value / max) * 100;
        return (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-ink-2">{b.value}</span>
            {/* Columns stretch to the chart's height (they used to sit at the
                bottom with no height, so every bar drew at zero). */}
            <div className="relative w-full flex-1">
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 rounded-t-md transition-[height] duration-700 ease-[var(--ease-out)]",
                  roleBg[b.role ?? "brand"],
                )}
                style={{ height: `${Math.max(2, pct)}%` }}
                title={`${b.label}: ${b.value}`}
              />
            </div>
            <span className="text-xs font-semibold text-ink-3">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}
