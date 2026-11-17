"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/landing";
import { LETTERS, mark, questionLink, type McqPaper } from "@/lib/mcq-papers";
import { goldAction as gold, inlineLink, quietAction as ghost } from "@/components/tools/ToolBits";

// A shaded answer reads like pencil on the answer sheet: off-white, not gold.
const bubble =
  "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-hairline-strong text-base font-semibold text-muted-foreground transition-colors duration-150 hover:border-white/25 hover:text-foreground has-[:checked]:border-body has-[:checked]:bg-body has-[:checked]:text-band-b has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold";

/** Saved answers survive a closed tab mid-paper. Browser storage can fail (private mode), so every call is guarded. */
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const parse = (raw: string | null, n: number): string[] => {
  try {
    const v = JSON.parse(raw ?? "null");
    if (Array.isArray(v) && v.length === n) return v.map((x) => (typeof x === "string" ? x : ""));
  } catch {}
  return Array(n).fill("");
};
const noSubscribe = () => () => {};
const save = (key: string, v: string[] | null) => {
  try {
    if (v) localStorage.setItem(key, JSON.stringify(v));
    else localStorage.removeItem(key);
  } catch {}
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A timed mock of one real paper: open the official PDF, shade answers here, get it marked. */
export function McqChecker({ paper, name, id }: { paper: McqPaper; name: string; id: string }) {
  const n = paper.answers.length;
  const storeKey = `mcq:${id}`;
  // The server (and the first client render) has no saved answers; the stored copy appears straight after.
  const saved = useSyncExternalStore(noSubscribe, () => read(storeKey), () => null);
  const [edited, setGiven] = useState<string[] | null>(null);
  const given = useMemo(() => edited ?? parse(saved, n), [edited, saved, n]);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    if (!endsAt || marked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt, marked]);

  const result = useMemo(() => (marked ? mark(paper, given) : null), [marked, paper, given]);
  const answered = given.filter(Boolean).length;
  // Wrong answers, and blanks Hamza has explained, get a line each; other blanks are listed together.
  const review = result?.wrong.filter((w) => w.given || paper.notes?.[w.n]) ?? [];
  const quietBlanks = result?.wrong.filter((w) => !w.given && !paper.notes?.[w.n]) ?? [];
  const left = endsAt ? endsAt - now : null;

  const choose = (i: number, l: string) => {
    const next = given.slice();
    next[i] = l;
    setGiven(next);
    save(storeKey, next);
  };
  const submit = () => {
    setMarked(true);
    const r = mark(paper, given);
    track("mcq_marked", { paper: id, score: r.score, total: r.total });
    requestAnimationFrame(() => document.getElementById("mcq-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const restart = () => {
    setGiven(Array(n).fill(""));
    save(storeKey, null);
    setMarked(false);
    setEndsAt(null);
  };

  return (
    <div className="space-y-8">
      <ol className="space-y-5 text-lg leading-relaxed text-body">
        <li>
          <strong className="text-foreground">1. Open the paper.</strong>{" "}
          <a href={paper.questionPaper} target="_blank" rel="noopener" className={inlineLink}>
            {name} question paper
          </a>{" "}
          <span className="text-muted-foreground">(PDF on the Cambridge website). Print it or keep it open in another tab.</span>
        </li>
        <li>
          <strong className="text-foreground">2. Start the clock, if you want exam conditions.</strong>{" "}
          <span className="text-muted-foreground">You have {paper.minutes} minutes for {n} questions, the same as the real paper.</span>
          <div className="mt-3">
            {left === null ? (
              <button type="button" className={ghost} onClick={() => { setEndsAt(Date.now() + paper.minutes * 60_000); setNow(Date.now()); }} disabled={marked}>
                Start {paper.minutes}-minute timer
              </button>
            ) : (
              <p role="timer" aria-live="off" className={`text-title font-bold tabular-nums ${left <= 0 ? "text-error-x" : "text-foreground"}`}>
                {left <= 0 ? "Time is up. Finish the question you are on, then mark it." : clock(left)}
              </p>
            )}
          </div>
        </li>
        <li>
          <strong className="text-foreground">3. Shade each answer below,</strong>{" "}
          <span className="text-muted-foreground">then mark the paper. Your answers are saved on this device as you go.</span>
        </li>
      </ol>

      <fieldset disabled={marked} className="pc-surface min-w-0 rounded-card p-5 sm:p-6">
        <legend className="sr-only">Answer sheet</legend>
        <div className="flex items-center justify-between gap-4">
          <p className="text-base font-semibold text-foreground">Answer sheet</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            {answered} of {n} answered
          </p>
        </div>
        <ol className="mt-5 grid gap-x-10 gap-y-3 md:grid-cols-2">
          {given.map((g, i) => {
            const row = result?.wrong.find((w) => w.n === i + 1);
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="w-7 text-right text-sm tabular-nums text-faint">{i + 1}</span>
                <div role="radiogroup" aria-label={`Question ${i + 1}`} className="flex gap-2">
                  {LETTERS.map((l) => (
                    <label key={l} className={bubble}>
                      <input type="radio" name={`q${i + 1}`} value={l} checked={g === l} onChange={() => choose(i, l)} className="sr-only" />
                      {l}
                    </label>
                  ))}
                </div>
                {result && (
                  <span className={`text-sm font-semibold ${row ? "text-error-x" : "text-muted-foreground"}`}>{row ? row.correct : "✓"}</span>
                )}
              </li>
            );
          })}
        </ol>
      </fieldset>

      {!marked ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className={gold} onClick={submit} disabled={answered === 0}>
            Mark my paper
          </button>
          {answered < n && answered > 0 && (
            <p className="self-center text-sm text-muted-foreground">
              {n - answered} left blank. A blank scores nothing, so guess before you mark.
            </p>
          )}
        </div>
      ) : (
        result && (
          <section id="mcq-result" aria-live="polite" className="pc-surface scroll-mt-28 rounded-card p-5 sm:p-6">
            <p className="text-sm font-semibold text-muted-foreground">Your score</p>
            <p className="mt-2 text-6xl font-extrabold tabular-nums leading-none text-gold">
              {result.score}
              <span className="text-2xl font-semibold text-muted-foreground"> / {result.total}</span>
            </p>
            <p className="mt-3 text-base text-body">
              {Math.round((result.score / result.total) * 100)}%{result.blanks > 0 && `, with ${result.blanks} left blank`}.
            </p>

            {result.byTopic.length > 0 && (
              <div className="mt-8">
                <p className="text-base font-semibold text-foreground">By topic, weakest first</p>
                <ul className="mt-2 divide-y divide-hairline text-base text-body">
                  {result.byTopic.map(([t, s]) => (
                    <li key={t} className="flex justify-between gap-4 py-2.5">
                      <span>{t}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.right} / {s.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {review.length > 0 && (
              <div className="mt-8">
                <p className="text-base font-semibold text-foreground">Questions to look at again</p>
                <ul className="mt-2 divide-y divide-hairline text-base leading-relaxed text-body">
                  {review.map((w) => (
                    <li key={w.n} className="py-3">
                      <a href={questionLink(paper, w.n)} target="_blank" rel="noopener" className={inlineLink}>
                        Question {w.n}
                      </a>
                      :{" "}
                      {w.given ? `you chose ${w.given}, the answer is ${w.correct}.` : `left blank, the answer is ${w.correct}.`}
                      {paper.notes?.[w.n] && <span className="mt-1 block text-sm text-muted-foreground">{paper.notes[w.n]}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {quietBlanks.length > 0 && (
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                Left blank: {quietBlanks.map((w) => w.n).join(", ")}. The correct letters are next to each one on the answer sheet.
              </p>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={paper.markScheme} target="_blank" rel="noopener" className={ghost}>
                Official mark scheme
              </a>
              <button type="button" className={ghost} onClick={restart}>
                Try this paper again
              </button>
            </div>
          </section>
        )
      )}
    </div>
  );
}
