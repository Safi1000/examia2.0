"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PracticeQuestion } from "@/lib/past-papers";
import { track } from "@/lib/landing";
import { cn } from "@/lib/cn";
import { recordAnswers, useNight, useProgress } from "./progress";
import { NightToggle, ShareScore } from "./Bits";

const gold =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gold px-6 text-[16px] font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40";
const ghost =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-hairline-strong px-6 text-[16px] font-semibold text-foreground transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
    on ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-muted-foreground hover:border-gold-border hover:text-foreground",
  );

/** One question cut out of its page image. */
export function QuestionImage({ q, night }: { q: PracticeQuestion; night: boolean }) {
  const h = q.b - q.t;
  return (
    <div className={cn("relative w-full overflow-hidden rounded-[14px]", night ? "bg-[#1b1d20]" : "bg-white")} style={{ aspectRatio: `1 / ${h * q.r}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={q.img}
        alt={`Question ${q.n} from ${q.c}`}
        width={1100}
        height={Math.round(1100 * q.r)}
        className={cn("absolute left-0 w-full max-w-none", night && "invert hue-rotate-180")}
        style={{ top: `${(-q.t / h) * 100}%` }}
      />
    </div>
  );
}

type Phase = "setup" | "play" | "done";
const SIZES = [10, 20, 30];

/**
 * Quick multiple choice practice: a handful of real past paper questions one
 * at a time, each marked the moment it is answered. Wrong answers go on the
 * student's mistakes list, and "My mistakes" brings exactly those back until
 * they are right.
 */
export function QuestionPractice({
  questions,
  papers,
  name,
  path,
  code,
  topics,
}: {
  questions: PracticeQuestion[];
  papers: Array<{ num: string; label: string }>;
  name: string;
  path: string;
  code: string;
  topics: Array<{ t: string; n: number }>;
}) {
  const { seen, wrong } = useProgress();
  const [night] = useNight();
  const [phase, setPhase] = useState<Phase>("setup");
  const [size, setSize] = useState(10);
  const [year, setYear] = useState<number | null>(null);
  const [paper, setPaper] = useState<string | null>(papers.length > 1 ? papers[0].num : null);
  const [mode, setMode] = useState<"new" | "mistakes">("new");
  const [set, setSet] = useState<PracticeQuestion[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [topicIds, setTopicIds] = useState<Set<string> | null>(null);
  const [topicBusy, setTopicBusy] = useState(false);
  const [log, setLog] = useState<Array<{ q: PracticeQuestion; pick: string; right: boolean }>>([]);

  useEffect(() => {
    // "?mode=mistakes" from the progress page opens straight on the mistakes list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URLSearchParams(window.location.search).get("mode") === "mistakes") setMode("mistakes");
  }, []);

  const years = useMemo(() => [...new Set(questions.map((q) => q.y))].sort((a, b) => b - a), [questions]);
  const pool = questions.filter((q) => (!paper || q.num === paper) && (!year || q.y === year) && (!topicIds || topicIds.has(q.id)));

  const findTopic = async (t: string) => {
    const term = t.trim();
    setTopic(term);
    if (term.replace(/[^a-z0-9]/gi, "").length < 3) {
      setTopicIds(null);
      return;
    }
    setTopicBusy(true);
    try {
      const r = await fetch(`/api/past-papers/search?type=q&code=${code}&q=${encodeURIComponent(term)}`);
      const d = (await r.json()) as { ids: string[] };
      setTopicIds(new Set(d.ids));
      track("question_practice_topic", { syllabus: name, topic: term, found: d.ids.length });
    } catch {
      setTopicIds(new Set());
    } finally {
      setTopicBusy(false);
    }
  };
  const mine = questions.filter((q) => wrong[q.id]);
  const fresh = pool.filter((q) => !seen[q.id]).length;

  const begin = (m: "new" | "mistakes") => {
    let pickFrom: PracticeQuestion[];
    if (m === "mistakes") pickFrom = [...mine];
    else {
      const unseen = pool.filter((q) => !seen[q.id]);
      pickFrom = unseen.length >= size ? unseen : pool;
    }
    const shuffled = [...pickFrom].sort(() => Math.random() - 0.5).slice(0, size);
    setSet(shuffled);
    setI(0);
    setPicked(null);
    setLog([]);
    setMode(m);
    setPhase("play");
    track("question_practice_start", { syllabus: name, mode: m, size: shuffled.length });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const q = set[i];
  const answer = (L: string) => {
    if (!q || picked) return;
    setPicked(L);
    const right = L === q.a;
    setLog((l) => [...l, { q, pick: L, right }]);
    recordAnswers([{ id: q.id, right }]);
  };
  const next = () => {
    if (i + 1 >= set.length) {
      setPhase("done");
      track("question_practice_done", { syllabus: name, score: log.filter((x) => x.right).length, of: set.length });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setI(i + 1);
      setPicked(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toUpperCase();
      const map: Record<string, string> = { "1": "A", "2": "B", "3": "C", "4": "D", A: "A", B: "B", C: "C", D: "D" };
      if (!picked && map[k]) answer(map[k]);
      else if (picked && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (phase === "setup") {
    return (
      <div className="space-y-6">
        {mine.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-gold-border bg-card-raised px-6 py-5">
            <div>
              <p className="text-lg font-semibold text-foreground">
                {mine.length} {mine.length === 1 ? "question" : "questions"} on your mistakes list
              </p>
              <p className="mt-0.5 text-[15px] text-muted-foreground">Get each one right and it leaves the list.</p>
            </div>
            <button type="button" onClick={() => begin("mistakes")} className={gold}>
              Redo my mistakes
            </button>
          </div>
        )}

        <div className="rounded-[20px] border border-hairline bg-card px-6 py-6 md:px-8 md:py-7">
          <h2 className="text-xl font-bold text-foreground">New questions</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {pool.length} questions to choose from, {fresh} you haven&apos;t done yet. Questions you haven&apos;t seen come first.
          </p>

          <fieldset className="mt-6">
            <legend className="mb-2 text-[15px] font-semibold text-foreground">Topic</legend>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void findTopic(topic);
              }}
            >
              <label htmlFor="topic-q" className="sr-only">
                Topic or keyword
              </label>
              <input
                id="topic-q"
                type="search"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (!e.target.value) setTopicIds(null);
                }}
                placeholder="Any topic, or type one"
                className="h-12 min-w-0 flex-1 rounded-full border border-hairline-strong bg-band-c px-5 text-[16px] text-foreground placeholder:text-faint focus:border-gold-border focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-gold"
              />
              <button type="submit" className="h-12 shrink-0 rounded-full border border-hairline-strong px-5 text-[15px] font-semibold text-foreground hover:border-gold-border">
                {topicBusy ? "Finding…" : "Find"}
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!topicIds}
                onClick={() => {
                  setTopic("");
                  setTopicIds(null);
                }}
                className={chip(!topicIds)}
              >
                All topics
              </button>
              {topics.map((t) => (
                <button key={t.t} type="button" aria-pressed={!!topicIds && topic === t.t} onClick={() => void findTopic(t.t)} className={chip(!!topicIds && topic === t.t)}>
                  {t.t}
                  <span className="ml-1.5 text-[13px] font-normal opacity-70">{t.n}</span>
                </button>
              ))}
            </div>
            {topicIds && (
              <p className="mt-3 text-[15px] text-muted-foreground" aria-live="polite">
                {topicIds.size ? `${pool.length} questions mention “${topic}”${pool.length < topicIds.size ? " with these filters" : ""}.` : `No multiple choice question mentions “${topic}”. Try another word.`}
              </p>
            )}
          </fieldset>

          {papers.length > 1 && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-[15px] font-semibold text-foreground">Paper</legend>
              <div className="flex flex-wrap gap-2">
                {papers.map((p) => (
                  <button key={p.num} type="button" aria-pressed={paper === p.num} onClick={() => setPaper(p.num)} className={chip(paper === p.num)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="mt-6">
            <legend className="mb-2 text-[15px] font-semibold text-foreground">Year</legend>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              <button type="button" aria-pressed={!year} onClick={() => setYear(null)} className={chip(!year)}>
                All years
              </button>
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)} className={chip(year === y)}>
                  {y}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="mb-2 text-[15px] font-semibold text-foreground">How many</legend>
            <div className="flex gap-2">
              {SIZES.map((n) => (
                <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)} className={chip(size === n)}>
                  {n} questions
                </button>
              ))}
            </div>
          </fieldset>

          <button type="button" onClick={() => begin("new")} disabled={!pool.length} className={cn(gold, "mt-8 w-full sm:w-auto")}>
            Start {Math.min(size, pool.length)} questions
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const right = log.filter((x) => x.right).length;
    const pct = Math.round((right / Math.max(1, log.length)) * 100);
    const missed = log.filter((x) => !x.right);
    return (
      <div className="space-y-6">
        <div className="rounded-[24px] border border-gold-border bg-card-raised px-6 py-7 md:px-10 md:py-9" role="status">
          <p className="text-[15px] font-semibold text-gold">{mode === "mistakes" ? "Mistakes round done" : "Round done"}</p>
          <p className="mt-2 text-6xl font-bold tabular-nums text-foreground">
            {right}
            <span className="text-3xl text-muted-foreground"> / {log.length}</span>
          </p>
          <p className="mt-2 text-lg text-muted-foreground">
            {pct >= 80 ? "Strong round." : pct >= 50 ? "Good base. The ones you missed are saved for you." : "Every mistake here is one you won't make in the exam. They're saved for you."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => begin("new")} className={gold}>
              Another {size}
            </button>
            {Object.keys(wrong).length > 0 && (
              <button type="button" onClick={() => begin("mistakes")} className={ghost}>
                Redo my mistakes
              </button>
            )}
            <ShareScore text={`I got ${right}/${log.length} on real ${name} past paper questions.`} path={path} />
          </div>
        </div>

        {missed.length > 0 && (
          <section aria-labelledby="missed-h">
            <h2 id="missed-h" className="text-xl font-bold text-foreground">
              The ones you missed
            </h2>
            <ul className="mt-4 space-y-5">
              {missed.map(({ q, pick }) => (
                <li key={q.id} className="rounded-[18px] border border-hairline bg-card p-4">
                  <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[15px]">
                    <span className="text-muted-foreground">
                      You picked <span className="font-semibold text-error-x">{pick}</span>, the answer is <span className="font-semibold text-success">{q.a}</span>
                    </span>
                    <Link href={q.href} className="font-semibold tabular-nums text-faint hover:text-gold">
                      {q.c} · Q{q.n}
                    </Link>
                  </p>
                  <QuestionImage q={q} night={night} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (!q) return null;
  const done = !!picked;
  const right = picked === q.a;
  return (
    <div className="mx-auto max-w-[820px]">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setPhase("setup")} className="min-h-11 rounded-full px-2 text-[15px] font-semibold text-muted-foreground hover:text-foreground">
          ← Stop
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-hairline" aria-hidden>
          <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${((i + (done ? 1 : 0)) / set.length) * 100}%` }} />
        </div>
        <span className="text-[15px] font-semibold tabular-nums text-foreground">
          {i + 1}/{set.length}
        </span>
        <NightToggle />
      </div>

      <p className="mt-5 text-[14px] font-semibold tabular-nums text-faint">
        {mode === "mistakes" ? "From your mistakes · " : ""}
        {q.c} · Question {q.n}
      </p>
      <div className="mt-2">
        <QuestionImage q={q} night={night} />
      </div>

      <div role="group" aria-label="Your answer" className="mt-5 grid grid-cols-4 gap-2.5">
        {["A", "B", "C", "D"].map((L) => {
          const isRight = L === q.a;
          const isPick = L === picked;
          return (
            <button
              key={L}
              type="button"
              onClick={() => answer(L)}
              disabled={done}
              aria-label={`Answer ${L}${done ? (isRight ? ", correct" : isPick ? ", your answer, wrong" : "") : ""}`}
              className={cn(
                "flex h-16 items-center justify-center rounded-[16px] border text-2xl font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                !done && "border-hairline-strong bg-card text-foreground hover:border-gold hover:bg-gold-tint active:scale-[0.98]",
                done && isRight && "border-success bg-success text-[#10201c]",
                done && isPick && !isRight && "border-error bg-error-soft text-error",
                done && !isRight && !isPick && "border-hairline text-faint",
              )}
            >
              {L}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="min-h-[96px]">
        {done && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className={cn("text-lg font-semibold", right ? "text-success" : "text-error-x")}>
              {right ? "Right." : `Not quite. The answer is ${q.a}.`}
              {!right && <span className="block text-[15px] font-normal text-muted-foreground">Saved to your mistakes list.</span>}
            </p>
            <button type="button" onClick={next} className={gold} autoFocus>
              {i + 1 >= set.length ? "See my score" : "Next question"}
            </button>
          </div>
        )}
      </div>
      <p className="mt-2 hidden text-[13px] text-faint md:block">Keys: 1 to 4 or A to D to answer, Enter for next.</p>
    </div>
  );
}
