"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Magnetic } from "./Magnetic";
import { track, waTextLink } from "@/lib/landing";
import type { Qualification } from "@/lib/grade-thresholds";
import {
  QUALIFICATIONS,
  SUBJECTS,
  gradeLabel,
  markError,
  marksNeeded,
  outlook,
  predict,
  roast,
  syllabusFor,
  targetGrades,
  type Subject,
} from "@/lib/grade-predictor";

const inputCls =
  "h-12 w-full rounded-xl border border-hairline-strong bg-band-c px-4 text-base tabular-nums text-foreground outline-none placeholder:text-faint focus:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const chipCls =
  "relative flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-hairline-strong px-2 py-2 text-center text-sm font-semibold leading-tight text-muted-foreground transition-colors hover:text-foreground has-[:checked]:border-gold has-[:checked]:bg-gold has-[:checked]:text-[#1b1e21] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold sm:rounded-full sm:px-4 sm:text-[15px]";

function Segmented<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
  cols = "grid-cols-3",
}: {
  legend: string;
  hint?: string;
  name: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  cols?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      {hint && <p className="mt-1 text-sm text-faint">{hint}</p>}
      <div className={`mt-3 grid gap-2 ${cols}`}>
        {options.map((o) => (
          <label key={o} className={chipCls}>
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Three steps: subject, level, marks. Graded against Cambridge's official
 * boundaries from the last four sessions (most likely grade plus the range),
 * with a "be safe for May / June 2027" target, a "what do I need for…" mode
 * and a shareable grade card.
 */
export function GradePredictor() {
  const uid = useId().replace(/:/g, "");
  const [subject, setSubject] = useState<Subject>("Accounting");
  const [qual, setQual] = useState<Qualification>("IGCSE");
  const [marks, setMarks] = useState<string[]>(["", "", "", ""]);

  const syl = syllabusFor(subject, qual);
  const papers = useMemo(() => syl?.papers ?? [], [syl]);
  const errors = papers.map((max, i) => markError(marks[i] ?? "", max));
  const filled = papers.every((_, i) => marks[i] !== "") && errors.every((e) => !e);

  const result = useMemo(
    () => (syl && filled ? predict(syl, papers.map((_, i) => Number(marks[i])), "Other", null) : null),
    [syl, filled, marks, papers],
  );
  // Target for next session: the next grade up, or keeping the top grade safe.
  const ahead = useMemo(() => {
    if (!syl || !result) return null;
    return outlook(syl, result.next ? result.next.grade : result.grade, result.total);
  }, [syl, result]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setMarks(["", "", "", ""]);
  };
  const g = (x: string) => gradeLabel(qual, x);

  // What the student asks for depends on where they are: top grades want to
  // make it safe, the middle wants the next grade, the bottom wants a restart.
  const band = result ? result.grade.toUpperCase() : "";
  const top = !!result && !result.next; // already the highest grade at this level (A* or AS a)
  const nextG = result?.next ? g(result.next.grade) : "";
  const gradeNow = result ? g(result.grade) : "";
  const cta = top
    ? `Make my ${gradeNow} exam-proof`
    : band === "A"
      ? `Turn my ${gradeNow} into an ${nextG}`
      : ["B", "C"].includes(band)
        ? `Get my plan to reach ${nextG}`
        : "Get my catch-up plan";
  const ask = top
    ? `I'm on track for ${gradeNow === "A*" ? "an A*" : `the top grade (${gradeNow})`}. I'd like help making it safe for May/June 2027: timed past papers and the top-band answers examiners look for.`
    : band === "A"
      ? "I'm close to an A*. I'd like help with the top-band answers and timing that get the last few marks."
      : ["B", "C"].includes(band)
        ? `I'd like a plan to reach ${nextG} by May/June 2027.`
        : "I need help catching up before May/June 2027. Where should I start?";
  const message =
    result && syl
      ? `Hi, I used the grade predictor on your site. ${subject} ${qual} (Cambridge ${syl.code}): ${papers
          .map((max, i) => `Paper ${i + 1} ${marks[i]}/${max}`)
          .join(", ")}. Predicted grade ${g(result.grade)}. ${ask}`
      : "";

  // When the grade first appears below the form, bring it into view once.
  const resultRef = useRef<HTMLElement>(null);
  const shown = useRef(false);
  useEffect(() => {
    if (!result) {
      shown.current = false;
      return;
    }
    if (shown.current) return;
    shown.current = true;
    const id = setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 450);
    return () => clearTimeout(id);
  }, [result]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <form className="min-w-0 rounded-[20px] border border-hairline bg-card/80 p-6 backdrop-blur-sm md:p-8" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-8">
          <Segmented legend="1. Subject" name={`${uid}-s`} options={SUBJECTS} value={subject} onChange={reset(setSubject)} />
          <Segmented
            legend="2. Level"
            hint={syl ? `Cambridge board · syllabus ${syl.code}` : undefined}
            name={`${uid}-q`}
            options={QUALIFICATIONS}
            value={qual}
            onChange={reset(setQual)}
            cols="grid-cols-2 sm:grid-cols-4"
          />
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-foreground">3. Your marks</legend>
            <p className="mt-1 text-sm text-faint">Your mock or past paper marks.</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {papers.map((max, i) => {
                const err = errors[i];
                const id = `${uid}-m${i}`;
                return (
                  <div key={`${syl?.code}-${qual}-${i}`}>
                    <label htmlFor={id} className="block text-sm text-muted-foreground">
                      Paper {i + 1} <span className="text-faint">out of {max}</span>
                    </label>
                    <input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={max}
                      step={1}
                      placeholder={`0 to ${max}`}
                      value={marks[i] ?? ""}
                      onChange={(e) => setMarks((m) => m.map((x, j) => (j === i ? e.target.value : x)))}
                      aria-invalid={!!err}
                      aria-describedby={err ? `${id}-err` : undefined}
                      className={`${inputCls} mt-2`}
                    />
                    {err && (
                      <p id={`${id}-err`} className="mt-2 text-sm text-error-x">
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>
      </form>

      <section
        ref={resultRef}
        aria-live="polite"
        aria-label="Your predicted grade"
        className="min-w-0 scroll-mt-28 rounded-[20px] border border-gold-border/60 bg-band-c/80 p-6 backdrop-blur-sm md:p-8"
      >
        {!result || !syl ? (
          <div>
            <p className="text-sm font-semibold text-foreground">Your grade shows here</p>
            <p className="mt-2 text-[17px] leading-relaxed text-muted-foreground">
              Enter your marks for {papers.length === 4 ? "all four papers" : "both papers"}.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">
              {subject} · {qual}
            </p>
            <div className="mt-4 flex items-end gap-5">
              <p className="text-7xl font-extrabold leading-none tracking-tight text-gold">{g(result.grade)}</p>
              <div className="pb-1.5">
                <p className="text-lg tabular-nums text-foreground">
                  {result.total} / {result.max}
                </p>
                <p className="text-xs text-faint">Your total</p>
              </div>
            </div>
            <p className="mt-4 font-hand text-2xl font-bold leading-snug text-gold">{roast(result.grade)}</p>

            {result.range && result.range.low !== result.range.high && (
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Over the last four exam sessions, these marks earned anything from {g(result.range.low)} to{" "}
                {g(result.range.high)}, depending on the paper.
              </p>
            )}

            <div className="relative mt-6 h-2 rounded-full bg-card-raised" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${Math.min(100, (result.total / result.max) * 100)}%` }} />
              {Object.entries(result.set.thresholds).map(([gr, min]) => (
                <span key={gr} className="absolute top-0 h-2 w-px bg-band-c" style={{ left: `${(min / result.max) * 100}%` }} />
              ))}
            </div>
            <div className="relative mt-2 h-4 text-[11px] tabular-nums text-faint" aria-hidden>
              {Object.entries(result.set.thresholds)
                .filter(([, min], i, arr) => i === 0 || arr[i - 1][1] - min >= result.max * 0.04)
                .map(([gr, min]) => (
                  <span key={gr} className="absolute -translate-x-1/2" style={{ left: `${(min / result.max) * 100}%` }}>
                    {g(gr)}
                  </span>
                ))}
            </div>

            {ahead && (
              <div className="mt-7 rounded-2xl border border-gold-border bg-gold-tint p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">For May / June 2027</p>
                <p className="mt-2 text-[15px] leading-relaxed text-body">
                  {result.next ? (
                    <>
                      To be safe for <strong className="text-foreground">{g(ahead.grade)}</strong>, aim for{" "}
                      <strong className="text-foreground">
                        {ahead.safe}/{result.max}
                      </strong>
                      . That&apos;s about <strong className="text-foreground">{ahead.rawToSafe} more marks</strong>
                      {syl.papers.length > 1 ? ` on Paper ${ahead.paper}` : ""}.
                    </>
                  ) : ahead.rawToSafe > 0 ? (
                    <>
                      To keep {g(ahead.grade)} safe, aim for <strong className="text-foreground">{ahead.safe}/{result.max}</strong>, about{" "}
                      {ahead.rawToSafe} more marks.
                    </>
                  ) : (
                    <>You&apos;re above every {g(ahead.grade)} boundary from the last four sessions.</>
                  )}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {g(ahead.grade)} needed {ahead.low === ahead.high ? ahead.low : `${ahead.low} to ${ahead.high}`} over the last
                  four sessions
                  {ahead.trend > 0
                    ? ` (up about ${ahead.trend} from June 2025 to June 2026).`
                    : ahead.trend < 0
                      ? ` (down about ${-ahead.trend} from June 2025 to June 2026).`
                      : " (about the same in June 2025 and June 2026)."}
                </p>
              </div>
            )}

            <Magnetic block strength={0.1} className="mt-7">
              <a
                href={waTextLink(message)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("whatsapp_click", { from: "grade_predictor", subject, qual, grade: result.grade })}
                className="btn-shine flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-6 py-3.5 text-center text-[15px] font-semibold text-[#1b1e21] transition-[background-color,transform] hover:bg-[#ffd07a] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {cta}
              </a>
            </Magnetic>
            <p className="mt-3 text-center text-sm text-faint">Opens WhatsApp with your result typed in. You press send.</p>
            <button
              type="button"
              onClick={() => void shareCard(g(result.grade), subject, qual)}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full border border-hairline-strong px-6 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Share my grade card
            </button>
          </div>
        )}
      </section>

      {syl && <MarksNeeded key={`${subject}-${qual}`} syl={syl} qual={qual} />}
    </div>
  );
}

/** The story-size card as an image: shared straight to WhatsApp/Instagram where the phone allows, else saved. */
async function shareCard(grade: string, subject: string, level: string) {
  const url = `/tools/grade-predictor/card?${new URLSearchParams({ g: grade, s: subject, l: level })}`;
  track("grade_card_share", { subject, level, grade });
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `my-${subject.toLowerCase()}-grade.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: "My predicted grade. Check yours free at hamzateaches.com" });
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    // Share sheet closed: nothing to do.
  }
}

/** "What do I need for an A*?": pick a grade, see the marks that were enough on every recent paper. */
function MarksNeeded({ syl, qual }: { syl: NonNullable<ReturnType<typeof syllabusFor>>; qual: Qualification }) {
  const grades = targetGrades(syl);
  const [target, setTarget] = useState(grades[0]);
  const need = marksNeeded(syl, target);
  const g = (x: string) => gradeLabel(qual, x);
  return (
    <section className="min-w-0 rounded-[20px] border border-hairline bg-card/80 p-6 backdrop-blur-sm md:p-8">
      <h3 className="text-sm font-semibold text-foreground">What do I need for…</h3>
      <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Target grade">
        {grades.map((gr) => (
          <button
            key={gr}
            type="button"
            role="radio"
            aria-checked={target === gr}
            onClick={() => setTarget(gr)}
            className={`min-h-12 rounded-full border text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
              target === gr ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-muted-foreground hover:text-foreground"
            }`}
          >
            {g(gr)}
          </button>
        ))}
      </div>
      {need && (
        <div className="mt-5">
          <p className="text-[17px] leading-relaxed text-body">
            About <strong className="text-foreground">{need.percent}%</strong> was enough for {g(need.grade)} on every paper in the last
            four sessions:
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {need.perPaper.map((m, i) => (
              <li key={i} className="rounded-xl border border-hairline bg-band-c px-4 py-3">
                <p className="text-xs text-faint">Paper {i + 1}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  {m} <span className="text-sm font-normal text-faint">/ {syl.papers[i]}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-faint">Doing better on one paper means you can drop a little on another.</p>
        </div>
      )}
    </section>
  );
}
