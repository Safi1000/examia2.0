"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { cn } from "@/lib/cn";
import { waTextLink } from "@/lib/landing";
import "@/components/landing/public-calm.css";

/**
 * The syllabus checklist's memory: how sure the student is of each
 * subtopic, kept on their own device (no account needed).
 */
export type Rating = "new" | "unsure" | "confident";
type Ctx = { ratings: Record<string, Rating>; rate: (num: string, r: Rating) => void; ready: boolean };
const C = createContext<Ctx>({ ratings: {}, rate: () => {}, ready: false });

export const storeKey = (code: string) => `ht_syl_${code}`;
export function readRatings(code: string): Record<string, Rating> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(storeKey(code)) ?? "{}");
    // A stored "null" or a number would crash the page: only accept a plain object.
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Rating>) : {};
  } catch {
    return {};
  }
}

export function ChecklistProvider({ code, children }: { code: string; children: ReactNode }) {
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setRatings(readRatings(code));
      setReady(true);
    }, 0);
    return () => clearTimeout(id);
  }, [code]);
  const rate = (num: string, r: Rating) =>
    setRatings((cur) => {
      const next = { ...cur, [num]: cur[num] === r ? ("new" as Rating) : r };
      try {
        localStorage.setItem(storeKey(code), JSON.stringify(next));
      } catch {}
      return next;
    });
  return <C.Provider value={{ ratings, rate, ready }}>{children}</C.Provider>;
}

/** Two taps per subtopic: Not sure / Confident (tap again to clear). */
export function Rate({ num, name }: { num: string; name: string }) {
  const { ratings, rate } = useContext(C);
  const r = ratings[num] ?? "new";
  // Chosen: the quiet off-white step plus a small mark (a tick for Confident), never a coloured fill.
  const btn = (on: boolean) =>
    cn(
      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
      on ? "border-white/[0.16] bg-white/[0.09] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "border-hairline-strong text-muted-foreground hover:border-white/25 hover:text-foreground",
    );
  return (
    <span className="flex shrink-0 gap-1.5" role="group" aria-label={`How sure are you of ${name}?`}>
      <button type="button" aria-pressed={r === "unsure"} onClick={() => rate(num, "unsure")} className={btn(r === "unsure")}>
        {r === "unsure" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />}
        Not sure
      </button>
      <button type="button" aria-pressed={r === "confident"} onClick={() => rate(num, "confident")} className={btn(r === "confident")}>
        {r === "confident" && (
          <svg aria-hidden viewBox="0 0 20 20" className="-ml-0.5 h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 10.5 3.5 3.5 7.5-8" />
          </svg>
        )}
        Confident
      </button>
    </span>
  );
}

/** Where the student stands, their weak list, and the next step. */
export function Progress({
  code,
  name,
  subtopics,
}: {
  code: string;
  name: string;
  subtopics: Array<{ num: string; name: string; topic: string; links: Array<{ href: string; label: string }> }>;
}) {
  const { ratings, ready } = useContext(C);
  const total = subtopics.length;
  const sure = subtopics.filter((s) => ratings[s.num] === "confident").length;
  const weak = useMemo(() => subtopics.filter((s) => ratings[s.num] === "unsure"), [subtopics, ratings]);
  const pct = total ? Math.round((sure / total) * 100) : 0;
  const message = `Hi, I'm studying ${name}. I'm not sure about: ${weak.map((w) => `${w.num} ${w.name}`).join("; ")}. Can you help?`;

  return (
    <div className="pc-surface rounded-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Your progress</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-foreground">{ready ? `${pct}%` : "0%"}</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {sure} of {total} subtopics confident{weak.length ? ` · ${weak.length} not sure` : ""}
          </p>
        </div>
        <p className="max-w-[30ch] text-sm text-muted-foreground">Saved on this device. Rate each subtopic below as you revise.</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
        <div className="h-full rounded-full bg-body transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      {weak.length > 0 && (
        <div className="mt-6">
          <p className="text-base font-semibold text-foreground">Your weak topics</p>
          <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
            {weak.slice(0, 8).map((w) => (
              <li key={w.num} className="py-2.5 text-base">
                <a href={`#s-${w.num}`} className="font-semibold text-foreground transition-colors duration-150 hover:text-muted-foreground">
                  <span className="tabular-nums text-faint">{w.num}</span> {w.name}
                </a>
                {w.links.length > 0 && (
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {w.links.map((l, i) => (
                      <span key={l.href}>
                        {i > 0 && " · "}
                        <Link href={l.href} className="text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                          {l.label}
                        </Link>
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <TrackedLink
              href={waTextLink(message)}
              props={{ from: `syllabus:${code}` }}
              className="inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-base font-semibold text-band-b transition-[background-color,transform] duration-150 hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Send my weak topics to Hamza
            </TrackedLink>
            <Link href={`/tools/revision-planner?s=${code}`} className="inline-flex min-h-12 items-center text-base font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
              Plan my revision
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
