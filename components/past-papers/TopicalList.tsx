"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TopicalQuestion, Seg } from "@/lib/topical";
import { cn } from "@/lib/cn";
import { recordAnswers, useNight, useProgress } from "./progress";
import { NightToggle } from "./Bits";

/** A quiet drop-down that fits a phone. */
const SELECT =
  "h-11 min-w-0 flex-1 appearance-none rounded-full border border-hairline-strong bg-card pl-4 pr-4 text-[15px] font-semibold text-foreground focus:border-gold-border focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-gold sm:flex-none sm:pr-6";


/** Cambridge pages have wide white margins: crop them so the question fills the width (easier to read on a phone). */
const MARGIN = 0.075;
const ZOOM = 1 / (1 - 2 * MARGIN);

/** One cut-out piece of a page. */
function Crop({ seg, night, alt }: { seg: Seg; night: boolean; alt: string }) {
  const h = seg.b - seg.t;
  const [ready, setReady] = useState(false);
  return (
    <div
      className={cn("relative w-full overflow-hidden transition-colors duration-500", !ready ? "skeleton" : night ? "bg-[#1b1d20]" : "bg-white")}
      style={{ aspectRatio: `1 / ${h * seg.r * ZOOM}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={seg.img}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={1100}
        height={Math.round(1100 * seg.r)}
        onLoad={() => setReady(true)}
        ref={(el) => {
          if (el?.complete && el.naturalWidth && !ready) setReady(true);
        }}
        className={cn("absolute max-w-none transition-opacity duration-500", ready ? "opacity-100" : "opacity-0", night && "invert hue-rotate-180")}
        style={{ top: `${(-seg.t / h) * 100}%`, width: `${ZOOM * 100}%`, left: `${-MARGIN * ZOOM * 100}%` }}
      />
    </div>
  );
}

function McqCard({ q, night }: { q: TopicalQuestion; night: boolean }) {
  const [pick, setPick] = useState<string | null>(null);
  const answer = (L: string) => {
    if (pick) return;
    setPick(L);
    recordAnswers([{ id: q.id, right: L === q.a }]);
  };
  return (
    <>
      <div className="overflow-hidden rounded-[12px]">
        <Crop seg={q.segs[0]} night={night} alt={`Question ${q.n} from ${q.c}`} />
      </div>
      <div role="group" aria-label="Your answer" className="mt-3 grid grid-cols-4 gap-2">
        {["A", "B", "C", "D"].map((L) => {
          const right = L === q.a;
          const mine = L === pick;
          return (
            <button
              key={L}
              type="button"
              disabled={!!pick}
              onClick={() => answer(L)}
              aria-label={`Answer ${L}${pick ? (right ? ", correct" : mine ? ", your answer, wrong" : "") : ""}`}
              className={cn(
                "flex h-12 items-center justify-center rounded-[12px] border text-lg font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                !pick && "border-hairline-strong text-foreground hover:border-gold hover:bg-gold-tint",
                pick && right && "border-success bg-success text-[#10201c]",
                pick && mine && !right && "border-error bg-error-soft text-error",
                pick && !right && !mine && "border-hairline text-faint",
              )}
            >
              {L}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-6 text-[14px]">
        {pick && (pick === q.a ? <span className="text-success">Right.</span> : <span className="text-error-x">The answer is {q.a}. Saved to your mistakes.</span>)}
      </p>
    </>
  );
}

function WrittenCard({ q, night, done, onDone }: { q: TopicalQuestion; night: boolean; done: boolean; onDone: () => void }) {
  return (
    <>
      <div className="overflow-hidden rounded-[12px]">
        {q.segs.map((seg, i) => (
          <Crop key={i} seg={seg} night={night} alt={`Question ${q.n} from ${q.c}, part ${i + 1}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-semibold">
        <Link href={`${q.href}?doc=ms${q.ms ? `&page=${q.ms}` : ""}`} className="inline-flex min-h-10 items-center text-gold hover:underline">
          Mark scheme
        </Link>
        <Link href={q.href} className="inline-flex min-h-10 items-center text-muted-foreground hover:text-foreground">
          Whole paper
        </Link>
        <button type="button" onClick={onDone} aria-pressed={done} className={cn("ml-auto inline-flex min-h-10 items-center rounded-full px-3", done ? "text-success" : "text-muted-foreground hover:text-foreground")}>
          {done ? "Done ✓" : "Mark as done"}
        </button>
      </div>
    </>
  );
}

const SERIES: Record<string, string> = { m: "Feb/March", s: "May/June", w: "Oct/Nov" };

/**
 * Every past paper question on one topic. Multiple choice can be answered
 * right here; written questions link to their mark scheme. Filters: paper,
 * year, and hiding what's already done.
 */
export function TopicalList({ questions, hasMcq, hasWritten }: { questions: TopicalQuestion[]; hasMcq: boolean; hasWritten: boolean }) {
  const { seen } = useProgress();
  const [night] = useNight();
  const [kind, setKind] = useState<"all" | "mcq" | "written">("all");
  const [year, setYear] = useState<number | null>(null);
  const [limit, setLimit] = useState(12);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("paper");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (k === "mcq" || k === "written") setKind(k);
  }, []);

  const years = useMemo(() => [...new Set(questions.map((q) => q.y))].sort((a, b) => b - a), [questions]);
  const shown = questions.filter((q) => (kind === "all" || q.kind === kind) && (!year || q.y === year));

  return (
    <div>
      <div className="sticky top-[84px] z-20 -mx-5 flex items-center gap-2 border-b border-hairline bg-[color-mix(in_srgb,var(--color-band-b)_92%,transparent)] px-5 py-3 backdrop-blur-xl sm:top-[96px]">
        {hasMcq && hasWritten && (
          <>
            <label className="sr-only" htmlFor="t-kind">Question type</label>
            <select id="t-kind" value={kind} onChange={(e) => setKind(e.target.value as "all" | "mcq" | "written")} className={SELECT}>
              <option value="all">All questions</option>
              <option value="mcq">Multiple choice</option>
              <option value="written">Written</option>
            </select>
          </>
        )}
        <label className="sr-only" htmlFor="t-year">Year</label>
        <select id="t-year" value={year ?? ""} onChange={(e) => setYear(Number(e.target.value) || null)} className={SELECT}>
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="ml-auto shrink-0">
          <NightToggle />
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-[17px] text-muted-foreground">No questions for that mix. Try another year.</p>
      ) : (
        <ol className="mt-6 space-y-6">
          {shown.slice(0, limit).map((q) => (
            <li key={q.id} className="rounded-[20px] border border-hairline bg-card p-4 sm:p-5">
              <p className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                <Link href={q.href} className="inline-flex min-h-10 items-center font-semibold tabular-nums text-muted-foreground hover:text-gold">
                  {q.c} · Question {q.n}
                </Link>
                <span className="text-faint">
                  {q.kind === "mcq" ? "Multiple choice" : `Paper ${q.num}`} · {SERIES[q.s]} {q.y}
                  {seen[q.id] ? <span className="ml-2 text-success">✓</span> : null}
                </span>
              </p>
              {q.kind === "mcq" ? <McqCard q={q} night={night} /> : <WrittenCard q={q} night={night} done={!!seen[q.id]} onDone={() => recordAnswers([{ id: q.id, right: true }])} />}
            </li>
          ))}
        </ol>
      )}
      {shown.length > limit && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={() => setLimit(limit + 12)} className="inline-flex min-h-12 items-center rounded-full border border-hairline-strong px-6 text-[15px] font-semibold text-foreground hover:border-gold-border">
            Show more questions
          </button>
        </div>
      )}
    </div>
  );
}
