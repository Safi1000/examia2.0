"use client";

import { useId, type ReactNode } from "react";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { cn } from "@/lib/cn";
import { waTextLink } from "@/lib/landing";
import "@/components/landing/public-calm.css";

/*
 * One look for every free tool, so the calculators read as one family:
 * the same field, label, switch, chip, result and buttons everywhere.
 * Chosen options are a quiet off-white step; gold is only the action.
 */
const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
/** The label above every field. */
export const fieldLabel = "mb-2 block text-sm font-semibold text-foreground";
/** The plain line under a field (a hint or the chosen date). */
export const fieldNote = "mt-1.5 block text-sm leading-snug text-muted-foreground";
/** A raw input or select: 48px, 16px text, a clear edge, the gold focus ring. */
export const fieldBox = `h-12 w-full rounded-field border border-hairline-strong bg-card px-4 text-base text-foreground outline-none transition-colors duration-150 placeholder:text-faint hover:border-white/25 ${ring} [color-scheme:dark]`;
/** The pill that holds a two or three way switch. */
export const segGroup = "inline-flex max-w-full flex-wrap gap-1 rounded-full border border-hairline bg-card p-1";
/** One option inside segGroup. */
export const seg = (on: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-150",
    ring,
    on ? "bg-white/[0.09] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-muted-foreground hover:text-foreground",
  );
/** A filter or pick-several chip. */
export const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98]",
    ring,
    on
      ? "border-white/[0.16] bg-white/[0.09] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      : "border-hairline-strong text-muted-foreground hover:border-white/25 hover:text-foreground",
  );
/** The one gold action. */
export const goldAction = `inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-6 text-base font-semibold text-band-b transition-[background-color,transform] duration-150 hover:bg-gold-hover active:scale-[0.98] disabled:opacity-50 ${ring}`;
/** Every other button: an outline pill. */
export const quietAction = `inline-flex min-h-12 items-center justify-center rounded-full border border-hairline-strong px-6 text-base font-semibold text-foreground transition-[background-color,border-color,transform] duration-150 hover:border-white/25 hover:bg-white/[0.04] active:scale-[0.98] ${ring}`;
/** A small text action (add a row, start again). */
export const textAction = `inline-flex min-h-11 items-center rounded-full text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline ${ring}`;

/** A link inside a sentence: off-white, underlined, never gold. */
export const inlineLink = "font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground";

/** A calm one-paragraph message where a result would be (nothing to show yet, or why not). */
export function Notice({ children }: { children: ReactNode }) {
  return <p className="pc-surface rounded-tile p-5 text-base leading-relaxed text-muted-foreground">{children}</p>;
}

/** Shared pieces for the free calculators: inputs, results and the ask. */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  allowNegative,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  /** Profits, cash flows: a minus sign is a real answer, not a typo. */
  allowNegative?: boolean;
  /** A problem only the tool can see (residual above cost, part years). */
  error?: string | null;
}) {
  const id = useId();
  const problem = fieldError(value, allowNegative) ?? error ?? null;
  const describedBy = [problem ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <div
        className={`flex h-12 items-center rounded-field border bg-card px-4 transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold ${problem ? "border-error-x" : "border-hairline-strong hover:border-white/25"}`}
      >
        {prefix && <span className="mr-2 text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          // Commas, spaces and currency signs are dropped, so "Rs 1,250" reads as 1250.
          onChange={(e) => onChange(e.target.value.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[^\d.\-]/g, ""))}
          aria-invalid={problem ? true : undefined}
          aria-describedby={describedBy}
          className="w-full min-w-0 bg-transparent text-base tabular-nums text-foreground outline-none placeholder:text-faint"
          // The box around it draws the focus ring; the site-wide ring would draw a second one inside it.
          style={{ outline: "none" }}
          placeholder="0"
        />
        {suffix && <span className="ml-2 shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
      {problem && (
        <p id={`${id}-err`} className="mt-1.5 text-sm leading-snug text-error-x">
          {problem}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className={fieldNote}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Half-typed entries ("-", ".") are not mistakes yet. */
const PARTIAL = new Set(["-", ".", "-."]);

/** What is wrong with what was typed, in words that say how to fix it, or null. */
export function fieldError(v: string, allowNegative = false): string | null {
  const t = v.trim();
  if (t === "" || PARTIAL.has(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return "Enter a number, for example 1250 or 12.5.";
  if (n < 0 && !allowNegative) return "Enter 0 or more, without a minus sign.";
  return null;
}

/** "" or a non-number reads as nothing yet. */
export const num = (v: string) => {
  const t = v.trim();
  if (t === "" || PARTIAL.has(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
/** Like num, but a negative entry also reads as nothing (its field shows why). */
export const amount = (v: string) => {
  const n = num(v);
  return n !== null && n >= 0 ? n : null;
};
export const fmt = (n: number, dp = 2) => {
  if (!Number.isFinite(n)) return "n/a";
  const s = n.toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: 0 });
  // -0.001 rounds to "-0": show plain 0.
  return /^-0(\.0+)?$/.test(s) ? "0" : s;
};

/**
 * One result: its name, one key number (large, tabular) and a plain line under it.
 * The headline result (strong) spans the full row, so it leads and the rest pair up below it.
 */
export function Result({ label, value, note, strong }: { label: string; value: string; note?: ReactNode; strong?: boolean }) {
  return (
    <div className={cn("pc-surface flex flex-col rounded-tile p-5", strong && "sm:col-span-2")}>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-2 break-words font-bold leading-tight tabular-nums text-foreground", strong ? "text-title sm:text-title-lg" : "text-title")}>{value}</p>
      {note && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Send the working to Hamza on WhatsApp, typed out, to ask about it. */
export function AskHamza({ tool, summary }: { tool: string; summary: string }) {
  return (
    <div className="pc-surface rounded-card p-5 sm:p-6">
      <p className="text-base font-semibold text-foreground">Not sure what your answer means for the exam?</p>
      <p className="mt-1 text-base text-muted-foreground">Send it to me on WhatsApp, already typed out, and ask.</p>
      <TrackedLink
        href={waTextLink(`Hi, I used your ${tool}. ${summary} Can you help me with this?`)}
        props={{ from: `tool:${tool}` }}
        className={cn("mt-4", goldAction)}
      >
        Ask on WhatsApp
      </TrackedLink>
    </div>
  );
}
