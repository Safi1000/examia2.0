"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { cn } from "@/lib/cn";
import { waTextLink } from "@/lib/landing";

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
    return JSON.parse(localStorage.getItem(storeKey(code)) ?? "{}") as Record<string, Rating>;
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
  const btn = (on: boolean, tone: "warn" | "ok") =>
    cn(
      "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors",
      on ? (tone === "ok" ? "border-[#7FD1A6] bg-[#7FD1A6] text-[#13261c]" : "border-gold bg-gold text-[#1b1e21]") : "border-hairline-strong text-muted-foreground hover:text-foreground",
    );
  return (
    <span className="flex shrink-0 gap-1.5" role="group" aria-label={`How sure are you of ${name}?`}>
      <button type="button" aria-pressed={r === "unsure"} onClick={() => rate(num, "unsure")} className={btn(r === "unsure", "warn")}>
        Not sure
      </button>
      <button type="button" aria-pressed={r === "confident"} onClick={() => rate(num, "confident")} className={btn(r === "confident", "ok")}>
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
    <div className="rounded-[20px] border border-gold-border bg-card-raised p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gold">Your progress</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-foreground">{ready ? `${pct}%` : "0%"}</p>
          <p className="text-[15px] text-muted-foreground">
            {sure} of {total} subtopics confident{weak.length ? ` · ${weak.length} not sure` : ""}
          </p>
        </div>
        <p className="max-w-[30ch] text-sm text-faint">Saved on this device. Rate each subtopic below as you revise.</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-card" aria-hidden>
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
      </div>
      {weak.length > 0 && (
        <div className="mt-6">
          <p className="font-semibold text-foreground">Your weak topics</p>
          <ul className="mt-2 space-y-2">
            {weak.slice(0, 8).map((w) => (
              <li key={w.num} className="text-[15px]">
                <a href={`#s-${w.num}`} className="text-body hover:text-gold">
                  {w.num} {w.name}
                </a>
                {w.links.length > 0 && (
                  <span className="ml-2 text-sm">
                    {w.links.map((l, i) => (
                      <span key={l.href}>
                        {i > 0 && " · "}
                        <Link href={l.href} className="text-gold hover:underline">
                          {l.label}
                        </Link>
                      </span>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <TrackedLink
            href={waTextLink(message)}
            props={{ from: `syllabus:${code}` }}
            className="mt-5 inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a]"
          >
            Send my weak topics to Hamza
          </TrackedLink>
          <Link href={`/tools/revision-planner?s=${code}`} className="ml-4 inline-flex min-h-12 items-center text-[15px] font-semibold text-gold hover:underline">
            Plan my revision
          </Link>
        </div>
      )}
    </div>
  );
}
