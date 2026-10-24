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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="flex h-12 items-center rounded-[12px] border border-hairline-strong bg-card px-4 focus-within:border-gold-border">
        {prefix && <span className="mr-2 text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.\-]/g, ""))}
          className="w-full bg-transparent text-[16px] tabular-nums text-foreground outline-none"
          placeholder="0"
        />
        {suffix && <span className="ml-2 text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** "" or a non-number reads as nothing yet. */
export const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
export const fmt = (n: number, dp = 2) => (Number.isFinite(n) ? n.toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: 0 }) : "n/a");

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
        className="mt-4 inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a]"
      >
        Ask on WhatsApp
      </TrackedLink>
    </div>
  );
}
