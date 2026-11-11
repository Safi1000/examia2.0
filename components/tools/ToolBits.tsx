"use client";

import { useId, type ReactNode } from "react";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { waTextLink } from "@/lib/landing";

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
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      <div
        className={`flex h-12 items-center rounded-[12px] border bg-card px-4 transition-colors hover:border-gold-border/60 focus-within:border-gold-border focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold ${problem ? "border-error-x" : "border-hairline-strong"}`}
      >
        {prefix && <span className="mr-2 text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          // Commas, spaces and currency signs are dropped, so "Rs 1,250" reads as 1250.
          onChange={(e) => onChange(e.target.value.replace(/[^\d.\-]/g, ""))}
          aria-invalid={problem ? true : undefined}
          aria-describedby={describedBy}
          className="w-full min-w-0 bg-transparent text-[16px] tabular-nums text-foreground outline-none"
          // The box around it draws the focus ring; the site-wide ring would draw a second one inside it.
          style={{ outline: "none" }}
          placeholder="0"
        />
        {suffix && <span className="ml-2 shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
      {problem && (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] leading-snug text-error-x">
          {problem}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
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

export function Result({ label, value, note, strong }: { label: string; value: string; note?: ReactNode; strong?: boolean }) {
  return (
    <div className={`rounded-[16px] border p-5 ${strong ? "border-gold-border bg-card-raised" : "border-hairline bg-card"}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-2 text-[15px] leading-relaxed text-body">{note}</p>}
    </div>
  );
}

/** Send the working to Hamza on WhatsApp, typed out, to ask about it. */
export function AskHamza({ tool, summary }: { tool: string; summary: string }) {
  return (
    <div className="rounded-[16px] border border-hairline bg-card p-5">
      <p className="font-semibold text-foreground">Not sure what your answer means for the exam?</p>
      <p className="mt-1 text-[15px] text-muted-foreground">Send it to me on WhatsApp, already typed out, and ask.</p>
      <TrackedLink
        href={waTextLink(`Hi, I used your ${tool}. ${summary} Can you help me with this?`)}
        props={{ from: `tool:${tool}` }}
        className="mt-4 inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        Ask on WhatsApp
      </TrackedLink>
    </div>
  );
}
