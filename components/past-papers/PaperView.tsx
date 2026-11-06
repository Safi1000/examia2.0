"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/landing";
import { cn } from "@/lib/cn";
import { addRecent, markDone, recordAnswers, unmarkDone, useNight, useProgress } from "./progress";
import { ShareScore } from "./Bits";

export interface ViewDoc {
  id: "qp" | "ms" | "in";
  label: string;
  pdf: string;
  name: string;
  pages: number;
}
export interface ViewThresholds {
  max: number;
  grades: Array<[string, number]>;
  series: string;
}

type Tab = "qp" | "ms" | "in";
type Mode = "view" | "practice" | "mark" | "result";

const gold =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gold px-5 text-[15px] font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40";
const ghost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hairline-strong px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const iconBtn =
  "h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-30 disabled:hover:bg-transparent";

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/** Shorthand that often appears in Cambridge mark schemes. */
const MS_WORDS: Array<[string, string]> = [
  ["OFR", "Own figure rule: you still get the method marks if you use your own earlier (wrong) figure correctly."],
  ["OWTTE", "Or words to that effect: any wording with the same meaning gets the mark."],
  ["BOD", "Benefit of the doubt: the examiner gave the mark although the answer was borderline."],
  ["CAO", "Correct answer only: no marks for method, just the right answer."],
  ["ORA", "Or reverse argument: the opposite way of saying it also gets the mark."],
  ["/", "Separates answers that are each acceptable."],
];

/** What Cambridge's command words ask for, in plain words. */
const COMMAND_WORDS: Array<[string, string]> = [
  ["Identify, State", "Name it briefly. No explanation needed."],
  ["Define", "Give the exact meaning of the term."],
  ["Explain", "Say why or how, linking each cause to its effect."],
  ["Analyse", "Break it down and show the chain of reasoning, step by step."],
  ["Discuss", "Give points on both sides."],
  ["Evaluate, Assess", "Weigh the points up and reach a judgement you can justify."],
  ["Calculate", "Work out the number and show your working."],
];

const minutesWord = (m: number) => {
  const r = Math.round(m * 10) / 10;
  return `${r} ${r === 1 ? "minute" : "minutes"}`;
};

const clock = (ms: number) => {
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const gradeOf = (score: number, t: ViewThresholds | null) => {
  if (!t) return null;
  for (const [g, min] of t.grades) if (score >= min) return g;
  return "U";
};

const ansKey = (k: string) => `ht-pp-ans-${k}`;
const readAns = (k: string, n: number): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(ansKey(k)) ?? "null");
    if (Array.isArray(v) && v.length === n) return v.map((x) => (typeof x === "string" ? x : ""));
  } catch {}
  return Array(n).fill("");
};
const writeAns = (k: string, v: string[] | null) => {
  try {
    if (v) localStorage.setItem(ansKey(k), JSON.stringify(v));
    else localStorage.removeItem(ansKey(k));
  } catch {}
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={cn("h-[18px] w-[18px]", className)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const I = {
  minus: "M5 10h10",
  plus: "M10 5v10M5 10h10",
  download: "M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4 16h12",
  print: "M6 7V3.5h8V7M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11.5h8v5H6z",
  full: "M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4",
  night: "M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z",
  split: "M3.5 4h13v12h-13zM10 4v12",
  guide: "M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 9v4.5M10 6.5v.01",
  close: "M5 5l10 10M15 5 5 15",
};

/** A scrolling stack of pages: images that work on every phone, or the PDF itself if there are none. */
function Pages({ doc, zoom, night, onPage }: { doc: ViewDoc; zoom: number; night: boolean; onPage?: (n: number) => void }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!onPage || !box.current) return;
    const seen = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio);
        let best = 1;
        let ratio = -1;
        for (const [n, r] of seen) if (r > ratio) [best, ratio] = [n, r];
        onPage(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    box.current.querySelectorAll("li").forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [doc.name, onPage]);

  if (!doc.pages) {
    return <iframe src={doc.pdf} title={doc.label} className="h-full min-h-[70dvh] w-full rounded-[8px] bg-white" />;
  }
  return (
    <ol ref={box} className="mx-auto space-y-4" style={{ width: `${zoom * 100}%`, maxWidth: zoom * 860 }} aria-label={doc.label}>
      {Array.from({ length: doc.pages }, (_, i) => (
        <li key={i} data-page={i + 1} id={onPage ? `pg-${i + 1}` : undefined} className="scroll-mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/papers/img/${doc.name}/${i + 1}.jpg`}
            alt={`${doc.label}, page ${i + 1} of ${doc.pages}`}
            width={1100}
            height={1556}
            loading={i < 2 ? "eager" : "lazy"}
            decoding="async"
            className={cn("h-auto w-full rounded-[4px] bg-white shadow-[0_12px_32px_-16px_rgba(0,0,0,0.8)]", night && "invert hue-rotate-180")}
          />
        </li>
      ))}
    </ol>
  );
}

function Bubbles({ answers, set, keyStr }: { answers: string[]; set: (i: number, v: string) => void; keyStr: string }) {
  return (
    <ol className="grid gap-1.5">
      {[...keyStr].map((k, i) => {
        if (k === "-" || k === "*")
          return (
            <li key={i} className="flex min-h-10 items-center gap-3">
              <span className="w-6 shrink-0 text-right text-[14px] font-semibold tabular-nums text-faint">{i + 1}</span>
              <span className="text-[14px] text-faint">{k === "-" ? "Removed by Cambridge" : "Mark given to everyone"}</span>
            </li>
          );
        return (
          <li key={i} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-right text-[14px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
            <span role="radiogroup" aria-label={`Question ${i + 1}`} className="flex gap-1.5">
              {["A", "B", "C", "D"].map((L) => {
                const on = answers[i] === L;
                return (
                  <button
                    key={L}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={L}
                    onClick={() => set(i, on ? "" : L)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                      on ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-muted-foreground hover:border-gold-border hover:text-foreground",
                    )}
                  >
                    {L}
                  </button>
                );
              })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One paper in a document viewer: question paper, mark scheme and insert,
 * scrolled like a PDF, with zoom, night colours, download, print and full
 * screen. Plus timed practice, instant marking for multiple choice, and the
 * grade a mark gets with Cambridge's thresholds for this exact paper.
 */
export function PaperView({
  pkey,
  code,
  label,
  url,
  minutes,
  marks,
  docs,
  answer,
  thresholds,
  report = null,
}: {
  pkey: string;
  code: string;
  label: string;
  url: string;
  minutes: number | null;
  marks: number | null;
  docs: ViewDoc[];
  answer: string | null;
  thresholds: ViewThresholds | null;
  /** The series' examiner report, if there is one. */
  report?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("qp");
  const [split, setSplit] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [night, toggleNight] = useNight();
  const [canFull, setCanFull] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const [now, setNow] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => Array(answer?.length ?? 0).fill(""));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { done } = useProgress();
  const mine = done[pkey];

  const qp = docs.find((d) => d.id === "qp")!;
  const ms = docs.find((d) => d.id === "ms") ?? null;
  const ins = docs.find((d) => d.id === "in") ?? null;
  // In a key, "-" is a question Cambridge removed (no mark) and "*" one where everyone gets the mark.
  const counted = answer ? [...answer].filter((c) => c !== "-").length : 0;
  const total = answer ? counted : (marks ?? thresholds?.max ?? null);
  const practising = mode === "practice";
  const current = tab === "ms" && ms ? ms : tab === "in" && ins ? ins : qp;

  useEffect(() => {
    addRecent({ u: url, c: code, l: label });
    /* eslint-disable react-hooks/set-state-in-effect */
    if (answer) setAnswers(readAns(pkey, answer.length));
    setCanFull(!!document.fullscreenEnabled);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [url, code, label, pkey, answer]);

  useEffect(() => {
    if (runningSince == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runningSince]);

  useEffect(() => {
    document.documentElement.classList.toggle("pp-practice", practising);
    return () => document.documentElement.classList.remove("pp-practice");
  }, [practising]);

  // A link like ?page=5&doc=ms (from search) opens that document at that page.
  const [jump, setJump] = useState<number | null>(null);
  const [guide, setGuide] = useState(false);
  /** "Continue from page 5": where they stopped reading last time, offered quietly once. */
  const [resume, setResume] = useState<number | null>(null);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const d = u.get("doc");
    const n = Number(u.get("page"));
    /* eslint-disable react-hooks/set-state-in-effect */
    if (d === "ms" || d === "in") setTab(d);
    if (n > 1) setJump(n);
    else {
      try {
        const saved = Number(localStorage.getItem(`ht-pp-pos-${pkey}`));
        if (saved > 1) setResume(saved);
      } catch {}
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pkey]);

  // Remember the page they're on in the question paper (quietly, on this device).
  useEffect(() => {
    if (tab !== "qp" || split || page < 1) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`ht-pp-pos-${pkey}`, String(page));
      } catch {}
    }, 800);
    return () => clearTimeout(t);
  }, [page, tab, split, pkey]);

  // The offer to continue fades away on its own.
  useEffect(() => {
    if (!resume) return;
    const t = setTimeout(() => setResume(null), 9000);
    return () => clearTimeout(t);
  }, [resume]);

  // New document: back to its first page.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [tab, split]);

  // Then, once, the page a link asked for.
  useEffect(() => {
    if (!jump) return;
    const t = setTimeout(() => {
      const box = scroller.current;
      const el = box?.querySelector<HTMLElement>(`#pg-${jump}`);
      if (box && el) {
        box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16 });
        document.getElementById("paper-view")?.scrollIntoView({ block: "start" });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [jump]);

  const elapsed = banked + (runningSince != null && now ? Math.max(0, now - runningSince) : 0);
  const limit = (minutes ?? 0) * 60_000;
  const left = limit - elapsed;
  const answered = answers.filter(Boolean).length;
  const correct = useMemo(() => (answer ? [...answer].reduce((n, r, i) => n + (r === "*" || (r !== "-" && answers[i] === r) ? 1 : 0), 0) : 0), [answers, answer]);

  const toView = () => requestAnimationFrame(() => document.getElementById("paper-view")?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const start = () => {
    setMode("practice");
    setTab(tab === "ms" ? "qp" : tab);
    setSplit(false);
    setBanked(0);
    setRunningSince(Date.now());
    setScore(null);
    track("past_paper_practice", { paper: code });
    toView();
  };
  const pause = () => {
    if (runningSince == null) setRunningSince(Date.now());
    else {
      setBanked(elapsed);
      setRunningSince(null);
    }
  };
  const finish = () => {
    setBanked(elapsed);
    setRunningSince(null);
    setSheetOpen(false);
    if (answer) {
      const g = gradeOf(correct, thresholds);
      setScore(correct);
      setMode("result");
      markDone(pkey, { s: correct, m: counted, g });
      recordAnswers([...answer].flatMap((r, i) => (r === "-" || r === "*" ? [] : [{ id: `${pkey}#${i + 1}`, right: answers[i] === r }])));
      track("past_paper_marked", { paper: code, score: correct });
    } else {
      setMode("mark");
      if (ms) setTab("ms");
    }
    toView();
  };
  const saveMark = () => {
    const n = Number(typed);
    if (!Number.isFinite(n) || n < 0 || (total != null && n > total)) return;
    setScore(n);
    setMode("result");
    markDone(pkey, { s: n, m: total, g: gradeOf(n, thresholds) });
    track("past_paper_marked", { paper: code, score: n });
  };
  const reset = () => {
    setMode("view");
    setRunningSince(null);
    setBanked(0);
    setScore(null);
    setTyped("");
    if (answer) {
      setAnswers(Array(answer.length).fill(""));
      writeAns(pkey, null);
    }
  };
  const setAns = (i: number, v: string) =>
    setAnswers((a) => {
      const next = [...a];
      next[i] = v;
      writeAns(pkey, next);
      return next;
    });

  const print = () => {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    f.src = current.pdf;
    f.onload = () => {
      try {
        f.contentWindow?.focus();
        f.contentWindow?.print();
      } catch {
        window.open(current.pdf, "_blank", "noopener");
      }
      setTimeout(() => f.remove(), 60_000);
    };
    document.body.appendChild(f);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panel.current?.requestFullscreen?.();
  };

  const grade = score != null ? gradeOf(score, thresholds) : null;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "qp", label: "Question paper" },
    ...(ms && !practising ? [{ id: "ms" as const, label: "Mark scheme" }] : []),
    ...(ins ? [{ id: "in" as const, label: "Insert" }] : []),
  ];
  const zi = ZOOMS.indexOf(zoom);

  return (
    <div id="paper-view" className="scroll-mt-[96px] sm:scroll-mt-[108px]">
      {/* Result */}
      {mode === "result" && score != null && (
        <div className="mb-5 rounded-[24px] border border-gold-border bg-card-raised p-6 md:p-8" role="status">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[14px] font-semibold text-gold">Your result</p>
              <p className="mt-2 text-6xl font-bold tabular-nums leading-none text-foreground">
                {score}
                {total != null && <span className="text-3xl text-muted-foreground"> / {total}</span>}
              </p>
            </div>
            {grade && (
              <div className="text-right">
                <p className="text-[14px] text-muted-foreground">Grade on this paper</p>
                <p className="text-6xl font-bold leading-none text-gold">{grade}</p>
              </div>
            )}
          </div>
          {thresholds && grade && (
            <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-muted-foreground">
              From Cambridge&apos;s thresholds for this exact paper in {thresholds.series}.{" "}
              {(() => {
                const idx = thresholds.grades.findIndex(([g]) => g === grade);
                const up = idx > 0 ? thresholds.grades[idx - 1] : grade === "U" ? thresholds.grades[thresholds.grades.length - 1] : null;
                return up ? `${up[1] - score} more ${up[1] - score === 1 ? "mark" : "marks"} would have made it ${up[0]}.` : "That's the top grade on this paper.";
              })()}
              {elapsed > 0 && minutes ? ` Time: ${clock(elapsed)} of ${minutes} minutes.` : ""}
            </p>
          )}
          {answer && counted - score > 0 && (
            <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Questions you missed">
              {[...answer].map((r, i) =>
                answers[i] === r || r === "-" || r === "*" ? null : (
                  <li key={i} className="rounded-full border border-hairline bg-card px-3 py-1.5 text-[14px] tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">Q{i + 1}</span> {answers[i] ? <span className="text-error-x">{answers[i]}</span> : "blank"} → <span className="font-semibold text-success">{r}</span>
                  </li>
                ),
              )}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {ms && (
              <button
                type="button"
                onClick={() => {
                  setTab("ms");
                  toView();
                }}
                className={gold}
              >
                Check the mark scheme
              </button>
            )}
            <button type="button" onClick={reset} className={ghost}>
              Try again
            </button>
            <ShareScore text={`I scored ${score}${total != null ? `/${total}` : ""}${grade ? ` (grade ${grade})` : ""} on ${code}.`} path={url} />
          </div>
        </div>
      )}

      {/* Marking a written paper */}
      {mode === "mark" && (
        <form
          className="mb-5 flex flex-wrap items-end gap-3 rounded-[24px] border border-gold-border bg-card-raised p-6 md:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            saveMark();
          }}
        >
          <div className="w-full">
            <p className="text-lg font-semibold text-foreground">Mark it with the mark scheme</p>
            <p className="mt-1 max-w-[60ch] text-[16px] text-muted-foreground">Add up your marks honestly, then put your total in.</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold text-muted-foreground">Your mark{total != null ? ` out of ${total}` : ""}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={total ?? undefined}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-12 w-32 rounded-[12px] border border-hairline-strong bg-card px-4 text-[17px] tabular-nums text-foreground focus:border-gold-border focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-gold"
            />
          </label>
          <button type="submit" className={gold} disabled={typed === "" || (total != null && Number(typed) > total)}>
            {thresholds ? "Show my grade" : "Save"}
          </button>
          <button type="button" onClick={reset} className="min-h-11 rounded-full px-3 text-[15px] font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          {total != null && Number(typed) > total && <p className="w-full text-[15px] text-error-x">The most this paper can get is {total}.</p>}
        </form>
      )}

      <div className={cn(practising && answer && "lg:grid lg:grid-cols-[minmax(0,1fr)_288px] lg:gap-5")}>
        {/* The viewer */}
        <div
          ref={panel}
          className="relative flex h-[calc(100dvh-110px)] min-h-[520px] flex-col overflow-hidden rounded-[22px] border border-hairline bg-band-c sm:h-[calc(100dvh-124px)] [&:fullscreen]:h-screen [&:fullscreen]:rounded-none"
        >
          <div className="flex items-center gap-2 border-b border-hairline px-2 py-2 sm:px-3">
            <div role="tablist" aria-label="Documents" className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={!split && tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setSplit(false);
                  }}
                  className={cn(
                    "min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold",
                    !split && tab === t.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center">
              {practising ? (
                <>
                  <span
                    role="timer"
                    aria-label={minutes ? (left >= 0 ? "Time left" : "Over time") : "Time taken"}
                    className={cn("px-2 text-lg font-bold tabular-nums", minutes && left < 0 ? "text-warning" : minutes && left < 5 * 60_000 ? "text-gold" : "text-foreground")}
                  >
                    {minutes ? `${left < 0 ? "+" : ""}${clock(left)}` : clock(elapsed)}
                  </span>
                  <button type="button" className={cn(iconBtn, "inline-flex", guide && "bg-white/10 text-foreground")} onClick={() => setGuide(!guide)} aria-pressed={guide} aria-label="How this paper is marked" title="How this paper is marked">
                    <Icon d={I.guide} />
                  </button>
                  <button type="button" onClick={pause} className="min-h-10 rounded-full px-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
                    {runningSince == null ? "Resume" : "Pause"}
                  </button>
                  <button type="button" onClick={finish} className="hidden min-h-10 items-center rounded-full bg-gold px-4 text-[14px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a] lg:inline-flex">
                    Finish
                  </button>
                </>
              ) : (
                <>
                  <span className="hidden items-center sm:flex">
                    <button type="button" className={cn(iconBtn, "inline-flex")} onClick={() => setZoom(ZOOMS[Math.max(0, zi - 1)])} disabled={zi <= 0} aria-label="Zoom out">
                      <Icon d={I.minus} />
                    </button>
                    <span className="w-12 text-center text-[13px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
                    <button type="button" className={cn(iconBtn, "inline-flex")} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])} disabled={zi >= ZOOMS.length - 1} aria-label="Zoom in">
                      <Icon d={I.plus} />
                    </button>
                    <span aria-hidden className="mx-1 h-5 w-px bg-hairline-strong" />
                  </span>
                  {ms && (
                    <button type="button" className={cn(iconBtn, "hidden lg:inline-flex", split && "bg-white/10 text-foreground")} onClick={() => setSplit(!split)} aria-pressed={split} aria-label="Question paper and mark scheme side by side" title="Side by side">
                      <Icon d={I.split} />
                    </button>
                  )}
                  <button type="button" className={cn(iconBtn, "inline-flex", guide && "bg-white/10 text-foreground")} onClick={() => setGuide(!guide)} aria-pressed={guide} aria-label="How this paper is marked" title="How this paper is marked">
                    <Icon d={I.guide} />
                  </button>
                  <button type="button" className={cn(iconBtn, "inline-flex", night && "text-gold")} onClick={toggleNight} aria-pressed={night} aria-label="Night colours" title="Night colours">
                    <Icon d={I.night} />
                  </button>
                  <button type="button" className={cn(iconBtn, "hidden sm:inline-flex")} onClick={print} aria-label={`Print ${current.label}`} title="Print">
                    <Icon d={I.print} />
                  </button>
                  <a href={current.pdf} download className={cn(iconBtn, "inline-flex")} aria-label={`Download ${current.label} PDF`} title="Download PDF">
                    <Icon d={I.download} />
                  </a>
                  {canFull && (
                    <button type="button" className={cn(iconBtn, "hidden sm:inline-flex")} onClick={fullscreen} aria-label="Full screen" title="Full screen">
                      <Icon d={I.full} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {practising && minutes ? (
            <div className="h-0.5 bg-hairline" aria-hidden>
              <div className={cn("h-full transition-[width] duration-1000", left < 0 ? "bg-warning" : "bg-gold")} style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} />
            </div>
          ) : null}

          {split && ms ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-hairline">
              {[qp, ms].map((d) => (
                <div key={d.id} className="min-h-0 overflow-y-auto bg-band-c px-4 py-4" tabIndex={0} aria-label={d.label}>
                  <p className="mb-3 text-center text-[13px] font-semibold text-faint">{d.label}</p>
                  <Pages doc={d} zoom={1} night={night} />
                </div>
              ))}
            </div>
          ) : (
            <div className="relative min-h-0 flex-1">
              <div ref={scroller} className="h-full overflow-auto px-3 py-4 sm:px-6 sm:py-6" tabIndex={0} role="tabpanel" aria-label={current.label}>
                <Pages doc={current} zoom={zoom} night={night} onPage={setPage} />
              </div>
              {resume && tab === "qp" && !practising && (
                <button
                  type="button"
                  onClick={() => {
                    setJump(resume);
                    setResume(null);
                  }}
                  className="absolute bottom-4 left-4 rounded-full border border-gold-border bg-band-b/90 px-4 py-2 text-[13px] font-semibold text-gold backdrop-blur transition-opacity hover:bg-band-b"
                >
                  Continue from page {resume}
                </button>
              )}
              {current.pages > 0 && (
                <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-hairline-strong bg-band-b/90 px-3.5 py-1.5 text-[13px] font-semibold tabular-nums text-foreground backdrop-blur">
                  {page} / {current.pages}
                </span>
              )}
            </div>
          )}

          {guide && (
            <div className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[360px] flex-col border-l border-hairline bg-card shadow-[-24px_0_48px_-24px_rgba(0,0,0,0.6)]" role="dialog" aria-label="How this paper is marked">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <p className="text-[15px] font-semibold text-foreground">How this paper is marked</p>
                <button type="button" className={cn(iconBtn, "inline-flex")} onClick={() => setGuide(false)} aria-label="Close">
                  <Icon d={I.close} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 text-[14px] leading-relaxed">
                {minutes && (answer ? answer.length : marks) ? (
                  <section>
                    <h3 className="text-[13px] font-semibold text-faint">Pace</h3>
                    <p className="mt-1 text-muted-foreground">
                      {answer
                        ? `About ${minutesWord(minutes / answer.length)} a question. If one is taking much longer, move on and come back.`
                        : `About ${minutesWord(minutes / (marks as number))} a mark, so a 6 mark question is worth roughly ${Math.round((minutes / (marks as number)) * 6)} minutes. Let the marks decide how much you write.`}
                    </p>
                  </section>
                ) : null}
                {!answer && (
                  <section>
                    <h3 className="text-[13px] font-semibold text-faint">What the question is asking</h3>
                    <dl className="mt-2 space-y-2">
                      {COMMAND_WORDS.map(([k, v]) => (
                        <div key={k}>
                          <dt className="font-semibold text-foreground">{k}</dt>
                          <dd className="text-muted-foreground">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                <section>
                  <h3 className="text-[13px] font-semibold text-faint">Mark scheme shorthand</h3>
                  <dl className="mt-2 space-y-2">
                    {MS_WORDS.map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="w-14 shrink-0 font-semibold text-gold">{k}</dt>
                        <dd className="text-muted-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                {report && (
                  <section>
                    <h3 className="text-[13px] font-semibold text-faint">Where marks were lost</h3>
                    <p className="mt-1 text-muted-foreground">The examiner report says what students did well and where they dropped marks in this series.</p>
                    <a href={report} target="_blank" rel="noopener" className="mt-2 inline-flex min-h-11 items-center font-semibold text-gold hover:underline">
                      Read the examiner report
                    </a>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>

        {practising && answer && (
          <aside className="hidden lg:block" aria-label="Answer sheet">
            <div className="flex h-[calc(100dvh-124px)] min-h-[520px] flex-col rounded-[22px] border border-hairline bg-card">
              <p className="flex items-baseline justify-between border-b border-hairline px-5 py-3.5 text-[15px] font-semibold text-foreground">
                Answer sheet
                <span className="text-[14px] font-normal tabular-nums text-muted-foreground">
                  {answered}/{counted}
                </span>
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <Bubbles answers={answers} set={setAns} keyStr={answer} />
              </div>
              <div className="border-t border-hairline p-3">
                <button type="button" onClick={finish} className={cn(gold, "w-full")}>
                  Finish and mark
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Practice or mark, under the viewer */}
      {mode === "view" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={start} className={gold}>
            {minutes ? `Practise it timed · ${minutes} min` : "Practise it timed"}
          </button>
          {mine ? (
            <p className="flex items-center gap-3 text-[15px] text-muted-foreground">
              <span>
                <span className="font-semibold text-success">Done</span>
                {mine.s != null && mine.m ? ` · ${mine.s}/${mine.m}` : ""}
                {mine.g ? ` · grade ${mine.g}` : ""}
              </span>
              <button type="button" onClick={() => unmarkDone(pkey)} className="min-h-11 rounded-full px-2 font-semibold hover:text-foreground">
                Unmark
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("mark");
                if (ms) setTab("ms");
                toView();
              }}
              className="min-h-11 rounded-full px-3 text-[15px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Already did it? Enter your mark
            </button>
          )}
          {answer && <span className="text-[14px] text-faint">Multiple choice: marked for you the moment you finish.</span>}
        </div>
      )}

      {/* Phone: answer sheet drawer, or a finish bar for written papers */}
      {practising && (
        <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {answer && sheetOpen && (
            <div className="max-h-[60dvh] overflow-y-auto border-t border-hairline-strong bg-card-raised px-5 py-4">
              <Bubbles answers={answers} set={setAns} keyStr={answer} />
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-hairline-strong bg-band-c/95 px-4 py-3 backdrop-blur-xl">
            {answer ? (
              <button type="button" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen} className={cn(ghost, "flex-1")}>
                {sheetOpen ? "Hide answer sheet" : `Answer sheet · ${answered}/${counted}`}
              </button>
            ) : (
              <span className="flex-1 text-[15px] text-muted-foreground">Write your answers on paper.</span>
            )}
            <button type="button" onClick={finish} className={gold}>
              {answer ? "Mark it" : "Finish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
