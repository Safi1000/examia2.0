"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TopicalQuestion, Seg } from "@/lib/topical";
import { cn } from "@/lib/cn";
import { recordAnswers, useNight, useProgress } from "./progress";
import { NightToggle } from "./Bits";

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
    on ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-muted-foreground hover:border-gold-border hover:text-foreground",
  );

/** One cut-out piece of a page. */
function Crop({ seg, night, alt }: { seg: Seg; night: boolean; alt: string }) {
  const h = seg.b - seg.t;
  const [ready, setReady] = useState(false);
  return (
    <div
      className={cn("relative w-full overflow-hidden transition-colors duration-500", !ready ? "animate-pulse bg-card-raised" : night ? "bg-[#1b1d20]" : "bg-white")}
      style={{ aspectRatio: `1 / ${h * seg.r}` }}
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
        className={cn("absolute left-0 w-full max-w-none transition-opacity duration-500", ready ? "opacity-100" : "opacity-0", night && "invert hue-rotate-180")}
        style={{ top: `${(-seg.t / h) * 100}%` }}
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
  const [hideDone, setHideDone] = useState(false);
  const [limit, setLimit] = useState(12);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("paper");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (k === "mcq" || k === "written") setKind(k);
  }, []);

  const years = useMemo(() => [...new Set(questions.map((q) => q.y))].sort((a, b) => b - a), [questions]);
  const shown = questions.filter((q) => (kind === "all" || q.kind === kind) && (!year || q.y === year) && (!hideDone || !seen[q.id]));
  const doneCount = questions.filter((q) => seen[q.id]).length;

  return (
    <div>
      <div className="sticky top-[84px] z-20 -mx-5 flex gap-2 overflow-x-auto border-b border-hairline bg-[color-mix(in_srgb,var(--color-band-b)_92%,transparent)] px-5 py-3 backdrop-blur-xl [scrollbar-width:none] sm:top-[96px]">
        {hasMcq && hasWritten && (
          <>
            <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")} className={chip(kind === "all")}>
              All
            </button>
            <button type="button" aria-pressed={kind === "mcq"} onClick={() => setKind("mcq")} className={chip(kind === "mcq")}>
              Multiple choice
            </button>
            <button type="button" aria-pressed={kind === "written"} onClick={() => setKind("written")} className={chip(kind === "written")}>
              Written
            </button>
            <span aria-hidden className="mx-1 w-px shrink-0 bg-hairline-strong" />
          </>
        )}
        {years.map((y) => (
          <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)} className={chip(year === y)}>
            {y}
          </button>
        ))}
        {doneCount > 0 && (
          <>
            <span aria-hidden className="mx-1 w-px shrink-0 bg-hairline-strong" />
            <button type="button" aria-pressed={hideDone} onClick={() => setHideDone(!hideDone)} className={chip(hideDone)}>
              Hide done
            </button>
          </>
        )}
        <span className="ml-auto shrink-0">
          <NightToggle />
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-[17px] text-muted-foreground">{hideDone && doneCount ? "You've done every question here. Nice work." : "No questions for that mix. Try another year."}</p>
      ) : (
        <ol className="mt-6 space-y-6">
          {shown.slice(0, limit).map((q) => (
            <li key={q.id} className="rounded-[20px] border border-hairline bg-card p-4 sm:p-5">
              <p className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                <Link href={q.href} className="font-semibold tabular-nums text-muted-foreground hover:text-gold">
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
