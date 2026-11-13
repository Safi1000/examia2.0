"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BookProgress } from "@/lib/syllabus-progress";
import type { DailyQuestion } from "@/app/api/daily-five/route";
import { Crop } from "@/components/past-papers/TopicalList";
import { recordAnswers } from "@/components/past-papers/progress";
import { useBackToClose } from "@/components/student/useBackToClose";
import { useFocusTrap } from "@/components/student/useFocusTrap";
import { Icon } from "@/components/ui";
import { PortalAmbient } from "@/components/PortalAmbient";
import { cn } from "@/lib/cn";
import { useNow } from "@/hooks/useNow";

/**
 * Daily 5: five real past paper multiple choice questions a day, only from
 * chapters the class has covered. About three minutes of recall, which is the
 * habit that keeps earlier topics from fading. Answers are kept on this
 * device only (and feed the past paper mistakes list, like the public pages).
 */
const KEY = "ht-daily5";
const LETTERS = ["A", "B", "C", "D"] as const;

/** The day number in Pakistan time, so the set turns over at local midnight. */
const dayOf = (ms: number) => Math.floor((ms + 5 * 3_600_000) / 86_400_000);

/**
 * Each pick sits next to the id of the question it answers, so a set that
 * changes during the day (a new chapter released) never scores an old pick
 * against a different question. Saves from before `ids` existed are by
 * position, and still read that way.
 */
type Saved = { day: number; picks: string[]; ids?: string[] };
function load(day: number): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s?.day === day && Array.isArray(s.picks)) return { day, picks: s.picks, ids: Array.isArray(s.ids) ? s.ids : undefined };
  } catch {}
  return { day, picks: [], ids: [] };
}
function save(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {}
}
/** The pick for each question of the set, in set order (undefined: not answered). */
function picksFor(saved: Saved, questions: DailyQuestion[]): (string | undefined)[] {
  const ids = saved.ids;
  return questions.map((q, i) => {
    if (!ids) return saved.picks[i];
    const at = ids.indexOf(q.id);
    return at >= 0 ? saved.picks[at] : undefined;
  });
}

const cache = new Map<string, Promise<DailyQuestion[]>>();
function fetchSet(query: string, day: number) {
  const k = `${query}@${day}`;
  if (!cache.has(k))
    cache.set(
      k,
      fetch(`/api/daily-five?s=${encodeURIComponent(query)}&d=${day}`)
        .then((r) => (r.ok ? r.json() : { questions: [] }))
        .then((x: { questions?: DailyQuestion[] }) => x.questions ?? [])
        .catch(() => {
          cache.delete(k);
          return [];
        }),
    );
  return cache.get(k)!;
}

export function DailyFive({ books }: { books: BookProgress[] }) {
  // Covered chapters per past paper syllabus, as the route reads them.
  const query = useMemo(() => {
    const byCode = new Map<string, Set<string>>();
    for (const b of books) for (const c of b.chapters) if (c.out) byCode.set(b.paperCode, (byCode.get(b.paperCode) ?? new Set()).add(c.num));
    return [...byCode].map(([code, set]) => `${code}:${[...set].join(",")}`).join("|");
  }, [books]);

  // Home only renders once the student is signed in, in the browser, so the
  // saved answers can be read straight away. The day follows the clock, so a
  // Home left open overnight moves on to the new set.
  const day = dayOf(useNow());
  const [stored, setStored] = useState<Saved>(() => (typeof window === "undefined" ? { day, picks: [], ids: [] } : load(day)));
  const saved: Saved = stored.day === day ? stored : { day, picks: [], ids: [] };
  const [loaded, setLoaded] = useState<{ key: string; questions: DailyQuestion[] } | null>(null);
  const [open, setOpen] = useState(false);
  const setKey = `${query}@${day}`;
  const questions = query && loaded?.key === setKey ? loaded.questions : null;

  useEffect(() => {
    if (!query) return;
    let live = true;
    fetchSet(query, day).then((q) => live && setLoaded({ key: `${query}@${day}`, questions: q }));
    return () => {
      live = false;
    };
  }, [query, day]);

  // A quick double tap must count once, not twice (in the score and in the
  // past paper mistakes list).
  const taken = useRef(new Set<string>());
  const answer = useCallback(
    (q: DailyQuestion, letter: string) => {
      const once = `${day}:${q.id}`;
      if (taken.current.has(once)) return;
      taken.current.add(once);
      setStored((prev) => {
        const base: Saved = prev.day === day ? prev : { day, picks: [], ids: [] };
        // An old by-position save gets its ids now, from the set it was made on.
        const ids = base.ids ?? (questions ?? []).slice(0, base.picks.length).map((x) => x.id);
        if (ids.includes(q.id)) return base;
        const next: Saved = { day, picks: [...base.picks, letter], ids: [...ids, q.id] };
        save(next);
        return next;
      });
      recordAnswers([{ id: q.id, right: letter === q.a }]);
    },
    [day, questions],
  );

  // Nothing covered yet, or a subject with no multiple choice paper: no card.
  if (!questions || questions.length === 0) return null;

  const picks = picksFor(saved, questions);
  const total = questions.length;
  const answered = picks.filter((p) => p !== undefined).length;
  const done = answered >= total;
  const score = questions.reduce((n, q, i) => n + (picks[i] === q.a ? 1 : 0), 0);

  return (
    // A plain row: Home's study card draws the surface and the lines between rows.
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="row-link group flex w-full items-center gap-4 px-5 py-3.5 text-left sm:px-6 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      >
        <Dots total={total} picks={picks} questions={questions} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Daily 5</span>
          <span className="block text-sm text-ink-2">
            {done
              ? `${score} of ${total} today. New questions tomorrow.`
              : answered
                ? `${total - answered} to go. Pick up where you left off.`
                : "Past paper questions from topics you've covered. About 3 min."}
          </span>
        </span>
        <span className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink transition-colors group-hover:border-brand/60">
          {done ? "Review" : answered ? "Continue" : "Start"}
          <Icon.ChevronRight className="h-4 w-4" />
        </span>
      </button>
      {open &&
        createPortal(
          <Sheet questions={questions} picks={picks} onAnswer={answer} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </li>
  );
}

/** Five small marks: gold for right, red for wrong, hollow for not done yet. */
function Dots({ total, picks, questions }: { total: number; picks: (string | undefined)[]; questions: DailyQuestion[] }) {
  return (
    <span aria-hidden className="grid h-10 w-10 shrink-0 grid-cols-3 content-center justify-items-center gap-1 rounded-full bg-white/[0.05] px-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            picks[i] === undefined ? "bg-white/20" : picks[i] === questions[i].a ? "bg-brand" : "bg-error",
          )}
        />
      ))}
    </span>
  );
}

function Sheet({
  questions,
  picks,
  onAnswer,
  onClose,
}: {
  questions: DailyQuestion[];
  picks: (string | undefined)[];
  onAnswer: (q: DailyQuestion, letter: string) => void;
  onClose: () => void;
}) {
  const total = questions.length;
  const finished = picks.every((p) => p !== undefined);
  // Open on the next unanswered question, or the summary once all are done.
  const [i, setI] = useState(() => {
    const next = picks.findIndex((p) => p === undefined);
    return next < 0 ? total : next;
  });
  useBackToClose(onClose);
  // Keyboard focus moves into the Daily 5, stays there, and returns on close.
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);

  // Fetch every question image now, so the next one is already there.
  useEffect(() => {
    for (const qq of questions) new Image().src = qq.segs[0].img;
  }, [questions]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const q = i < total ? questions[i] : null;
  const pick = q ? picks[i] : undefined;
  const score = questions.reduce((n, qq, k) => n + (picks[k] === qq.a ? 1 : 0), 0);

  return (
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Daily 5" className="fixed inset-0 z-[70] flex flex-col bg-paper text-ink outline-none">
      <PortalAmbient />
      <header className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <Icon.Close className="h-5 w-5" />
        </button>
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {questions.map((qq, k) => (
            <span
              key={qq.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                picks[k] === undefined ? (k === i ? "bg-white/35" : "bg-white/10") : picks[k] === qq.a ? "bg-brand" : "bg-error",
              )}
            />
          ))}
        </div>
        <span className="w-11 text-right text-sm tabular-nums text-ink-3">{q ? `${i + 1}/${total}` : ""}</span>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-2">
          {q ? (
            <div key={q.id} className="animate-fade-up">
              <p className="text-xs font-medium text-ink-3">
                {q.topic} · {q.c} Q{q.n}
              </p>
              <div className="mt-3 overflow-hidden rounded-[14px] ring-1 ring-white/10">
                <Crop seg={q.segs[0]} night={false} alt={`Question ${q.n} from ${q.c}`} />
              </div>
              <div role="group" aria-label="Your answer" className="mt-4 grid grid-cols-4 gap-2">
                {LETTERS.map((L) => {
                  const right = L === q.a;
                  const mine = L === pick;
                  return (
                    <button
                      key={L}
                      type="button"
                      disabled={!!pick}
                      onClick={() => onAnswer(q, L)}
                      aria-label={`Answer ${L}${pick ? (right ? ", correct" : mine ? ", your answer, wrong" : "") : ""}`}
                      className={cn(
                        "flex h-14 items-center justify-center rounded-[14px] border text-lg font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        !pick && "border-border-strong bg-surface text-ink hover:border-brand/70 active:scale-[0.98]",
                        pick && right && "border-success bg-success text-[#10201c]",
                        pick && mine && !right && "border-error bg-error-soft text-error",
                        pick && !right && !mine && "border-border text-ink-3",
                      )}
                    >
                      {L}
                    </button>
                  );
                })}
              </div>
              <div aria-live="polite" className="mt-4 min-h-[3.5rem]">
                {pick && (
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn("text-sm font-semibold", pick === q.a ? "text-success" : "text-error")}>
                      {pick === q.a ? "Right." : `The answer is ${q.a}.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setI(i + 1)}
                      autoFocus
                      className="flex h-12 items-center gap-1 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand active:scale-[0.98]"
                    >
                      {i + 1 < total ? "Next" : "See score"}
                      <Icon.ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-fade-up pt-8 text-center">
              <p className="text-sm font-medium text-ink-3">{finished ? "Today's Daily 5" : "Daily 5"}</p>
              <p className="mt-3 text-6xl font-extrabold tracking-tight text-ink tabular-nums">
                {score}
                <span className="text-3xl text-ink-3"> / {total}</span>
              </p>
              <p className="mx-auto mt-4 max-w-xs text-ink-2">
                {score === total
                  ? "Every one right. That's how topics stick."
                  : score >= total - 2
                    ? "Good work. The ones you missed come back in your past paper mistakes."
                    : "The ones you missed are worth a second look in your notes."}
              </p>
              <ul className="surface mx-auto mt-8 max-w-sm divide-y divide-hairline overflow-hidden rounded-xl text-left">
                {questions.map((qq, k) => {
                  const ok = picks[k] === qq.a;
                  return (
                    <li key={qq.id}>
                      <button
                        type="button"
                        onClick={() => setI(k)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/[0.03]"
                      >
                        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", ok ? "bg-success-soft text-success" : "bg-error-soft text-error")}>
                          {ok ? <Icon.Check className="h-3.5 w-3.5" /> : <Icon.Close className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink">{qq.topic}</span>
                        <span className="text-ink-3">Q{qq.n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={onClose}
                className="mt-8 h-12 rounded-full bg-brand px-8 text-sm font-semibold text-on-brand active:scale-[0.98]"
              >
                Done
              </button>
              <p className="mt-3 text-xs text-ink-3">New questions tomorrow.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
