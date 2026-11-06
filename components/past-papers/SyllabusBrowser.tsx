"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useProgress } from "./progress";

export interface BrowserPaper {
  key: string;
  href: string;
  num: string;
  pv: string;
  title: string | null;
  minutes: number | null;
  marks: number | null;
  mcq: boolean;
  insert: boolean;
}
export interface BrowserSeries {
  id: string;
  label: string;
  year: number;
  s: "m" | "s" | "w";
  er: string | null;
  gt: string | null;
  papers: BrowserPaper[];
}

const SERIES = [
  { id: "m", label: "Feb/March" },
  { id: "s", label: "May/June" },
  { id: "w", label: "Oct/Nov" },
] as const;

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
    on ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-muted-foreground hover:border-gold-border hover:text-foreground",
  );

const time = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

/**
 * All the papers for one syllabus with three filters (paper, year, series).
 * Every paper is in the page's HTML (so search engines see every link); the
 * filters only hide rows. The choice is kept in the address, so a filtered
 * list can be shared.
 */
export function SyllabusBrowser({ series, papers }: { series: BrowserSeries[]; papers: Array<{ num: string; title: string | null }> }) {
  const [paper, setPaper] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [ser, setSer] = useState<string | null>(null);
  const [todo, setTodo] = useState(false);
  const { done } = useProgress();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (q.get("paper")) setPaper(q.get("paper"));
    if (q.get("year")) setYear(Number(q.get("year")) || null);
    if (q.get("series")) setSer(q.get("series"));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (paper) q.set("paper", paper);
    if (year) q.set("year", String(year));
    if (ser) q.set("series", ser);
    const s = q.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  }, [paper, year, ser]);

  const years = useMemo(() => [...new Set(series.map((s) => s.year))], [series]);
  const shown = series
    .filter((s) => (!year || s.year === year) && (!ser || s.s === ser))
    .map((s) => ({ ...s, papers: s.papers.filter((p) => (!paper || p.num === paper) && (!todo || !done[p.key])) }))
    .filter((s) => s.papers.length);
  const count = shown.reduce((n, s) => n + s.papers.length, 0);
  const filtered = !!(paper || year || ser || todo);

  return (
    <div>
      <div className="sticky top-[84px] z-20 -mx-5 border-b border-hairline bg-[color-mix(in_srgb,var(--color-band-b)_92%,transparent)] px-5 py-3 backdrop-blur-xl sm:top-[96px]">
        <div role="group" aria-label="Paper" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button type="button" aria-pressed={!paper} onClick={() => setPaper(null)} className={chip(!paper)}>
            All papers
          </button>
          {papers.map((p) => (
            <button key={p.num} type="button" aria-pressed={paper === p.num} onClick={() => setPaper(paper === p.num ? null : p.num)} className={chip(paper === p.num)}>
              Paper {p.num}
              {p.title && <span className="ml-1.5 hidden font-normal opacity-80 md:inline">{p.title}</span>}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <div role="group" aria-label="Year" className="flex gap-2">
            {years.map((y) => (
              <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)} className={chip(year === y)}>
                {y}
              </button>
            ))}
          </div>
          <span aria-hidden className="mx-1 w-px shrink-0 bg-hairline-strong" />
          <div role="group" aria-label="Series" className="flex gap-2">
            {SERIES.map((s) => (
              <button key={s.id} type="button" aria-pressed={ser === s.id} onClick={() => setSer(ser === s.id ? null : s.id)} className={chip(ser === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {Object.keys(done).length > 0 && (
            <>
              <span aria-hidden className="mx-1 w-px shrink-0 bg-hairline-strong" />
              <button type="button" aria-pressed={todo} onClick={() => setTodo(!todo)} className={chip(todo)}>
                Not done yet
              </button>
            </>
          )}
        </div>
      </div>

      <p className="mt-5 flex min-h-11 items-center justify-between gap-4 text-[15px] text-muted-foreground" aria-live="polite">
        <span>
          {count} {count === 1 ? "paper" : "papers"}
          {filtered ? " match" : ", newest first"}
        </span>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setPaper(null);
              setYear(null);
              setSer(null);
              setTodo(false);
            }}
            className="min-h-11 rounded-full px-3 font-semibold text-gold hover:underline"
          >
            Clear filters
          </button>
        )}
      </p>

      <div className="space-y-10">
        {shown.map((s) => (
          <section key={s.id} aria-labelledby={`s-${s.id}`}>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-hairline pb-3">
              <h2 id={`s-${s.id}`} className="text-xl font-bold text-foreground md:text-2xl">
                {s.label}
              </h2>
              <p className="flex gap-1 text-[14px]">
                {s.er && (
                  <a href={s.er} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-muted-foreground hover:text-gold">
                    Examiner report
                  </a>
                )}
                {s.gt && (
                  <a href={s.gt} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-muted-foreground hover:text-gold">
                    Grade thresholds
                  </a>
                )}
              </p>
            </div>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {s.papers.map((p) => {
                const d = done[p.key];
                return (
                  <li key={p.key}>
                    <Link
                      href={p.href}
                      className={cn(
                        "group flex h-full items-center gap-4 rounded-[16px] border bg-card px-4 py-3.5 transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                        d ? "border-[rgba(111,187,168,0.35)]" : "border-hairline",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[12px] tabular-nums",
                          d ? "bg-success-soft text-success" : "bg-card-raised text-foreground",
                        )}
                      >
                        <span className="text-[17px] font-bold leading-none">{p.pv}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug text-foreground">
                          Paper {p.num}
                          {p.title ? ` · ${p.title}` : ""}
                        </span>
                        <span className="mt-0.5 block text-[14px] text-muted-foreground">
                          {p.pv.length > 1 ? `Variant ${p.pv.slice(-1)}` : ""}
                          {p.minutes ? ` · ${time(p.minutes)}` : ""}
                          {p.marks ? ` · ${p.marks} marks` : ""}
                        </span>
                        {d ? (
                          <span className="mt-1 block text-[13px] font-semibold text-success">
                            Done{d.s != null && d.m ? `: ${d.s}/${d.m}` : ""}
                            {d.g ? `, grade ${d.g}` : ""}
                          </span>
                        ) : p.mcq ? (
                          <span className="mt-1 block text-[13px] font-semibold text-gold">Marked for you instantly</span>
                        ) : null}
                      </span>
                      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m8 5 5 5-5 5" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!shown.length && <p className="rounded-[16px] border border-hairline bg-card px-5 py-6 text-[17px] text-muted-foreground">No papers for that mix. Try another year or series.</p>}
      </div>
    </div>
  );
}
