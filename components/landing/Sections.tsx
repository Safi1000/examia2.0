"use client";

import { useMemo, useRef, useState } from "react";
import { PillButton } from "./PillButton";
import { useLeadGate } from "./LeadGate";
import { VideoPlayer } from "./VideoPlayer";
import { waLink, track, type LevelName, type SubjectName } from "@/lib/landing";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{children}</p>
  );
}

/* ---------- Trust bar ---------- */
const trust = [
  {
    label: "Who teaches you",
    value: "ACCA + BSc Applied Accountancy",
    body: "Qualified in the subjects I teach, and I only teach these three. No side hustles, no rotating tutors.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" />
        <path d="M5 10v4c0 2 3 4 7 4s7-2 7-4v-4" />
      </svg>
    ),
  },
  {
    label: "What you cover",
    value: "The whole syllabus, then some",
    body: "Concepts in the order the examiner expects, past paper practice every week, and the exam techniques that turn a 7 mark answer into an 11.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5a2 2 0 0 1 2-2h11v18H6a2 2 0 0 1-2-2V5z" />
        <path d="M8 7h6M8 11h6M8 15h4" />
      </svg>
    ),
  },
  {
    label: "What a trial costs",
    value: "Nothing at all",
    body: "Watch a full lesson at your level before you hand over a single rupee. Decide after, not before.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9.5c-.7-1-1.9-1.5-3-1.5-1.7 0-3 1-3 2.3 0 1.4 1.3 1.9 3 2.4s3 1 3 2.4c0 1.3-1.3 2.3-3 2.3-1.1 0-2.3-.5-3-1.5M12 6.5v11" />
      </svg>
    ),
  },
];

export function TrustBar() {
  return (
    <section className="bg-band-b py-[54px] md:py-[74px]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {trust.map((t) => (
            <div
              key={t.label}
              className="group relative flex flex-col rounded-[22px] border border-hairline bg-card p-7 transition-all hover:-translate-y-1 hover:border-gold-border hover:bg-card-raised"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-border bg-gold-tint text-gold">
                {t.icon}
              </span>
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-faint">
                {t.label}
              </p>
              <h3 className="mt-2 text-lg font-bold leading-snug text-foreground">{t.value}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cross() {
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(224,133,133,0.4)]">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#e08585" strokeWidth="2" strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </span>
  );
}

/* ---------- Picker ---------- */
const SUBJECTS: SubjectName[] = ["Accounting", "Business", "Economics"];

type LevelCard = { level: LevelName; label: string; title: string; body: string };

const LEVEL_CARDS: Record<SubjectName, LevelCard[]> = {
  Accounting: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Double entry, the trial balance, and a full set of final accounts from a blank page." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Partnerships, limited companies, and the ratios examiners keep coming back to." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Manufacturing accounts, investment appraisal, and the analysis questions that carry the weight." },
  ],
  Business: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Business types, the marketing mix, and how a firm actually reaches a decision." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Motivation theory, cash flow, and building an argument the mark scheme rewards." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Strategy, stakeholder conflict, and the long case study questions." },
  ],
  Economics: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Supply, demand, and why a price moves the way it does." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Elasticity, market failure, and reading a diagram under exam pressure." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Macro policy, trade, and the evaluation questions that ask you to pick a side." },
  ],
};

export function FreeLesson() {
  const [subject, setSubject] = useState<SubjectName>("Accounting");
  const [pickedOnce, setPickedOnce] = useState(false);
  const gate = useLeadGate();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const cards = useMemo(() => LEVEL_CARDS[subject], [subject]);

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = SUBJECTS.length - 1;
    let next = i;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setSubject(SUBJECTS[next]);
    setPickedOnce(true);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="picker" className="bg-band-a py-[78px] md:py-[120px]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>Your free lesson</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl text-foreground md:text-5xl">
            Stop guessing. Start with one lesson.
          </h2>
        </div>

        {/* Steps */}
        <div className="mt-10 flex items-center justify-center gap-3 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-[#1b1e21]">1</span>
          <span className="font-semibold text-foreground">Subject</span>
          <span className="h-px w-10 bg-hairline-strong" />
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${pickedOnce ? "bg-gold text-[#1b1e21]" : "border border-hairline-strong text-faint"}`}>2</span>
          <span className={pickedOnce ? "font-semibold text-foreground" : "text-faint"}>Level</span>
        </div>

        {/* Tablist */}
        <div className="mt-8 flex justify-center">
          <div role="tablist" aria-label="Subject" className="inline-flex rounded-full border border-hairline bg-band-c p-1">
            {SUBJECTS.map((s, i) => {
              const active = s === subject;
              return (
                <button
                  key={s}
                  ref={(n) => {
                    tabRefs.current[i] = n;
                  }}
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => onTabKey(e, i)}
                  onClick={() => {
                    setSubject(s);
                    setPickedOnce(true);
                  }}
                  className={`rounded-full px-6 py-2.5 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                    active
                      ? "bg-gold text-[#1b1e21] shadow-[0_0_30px_rgba(251,193,89,0.35)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          Tap a subject. The levels below change to match it.
        </p>

        <div className="mt-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-faint">Step two</p>
          <p className="mt-2 text-lg text-foreground">
            You picked <span className="text-gold">{subject}</span>. Now pick your level.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">The lesson opens as soon as you choose.</p>
        </div>

        {/* Keyed on subject so the level cards remount and replay `float-in` */}
        <div key={subject} className="mt-10 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => (
            <button
              key={c.level}
              type="button"
              onClick={() => gate.open({ subject, level: c.level })}
              className="group float-in relative flex flex-col overflow-hidden rounded-[20px] border border-hairline bg-card p-7 text-left transition-all hover:-translate-y-1 hover:border-gold-border hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              style={{ animationDelay: `${0.05 + i * 0.09}s` }}
            >
              <span aria-hidden className="pointer-events-none absolute right-4 top-2 select-none text-[120px] font-bold leading-none text-white opacity-[0.03]">
                {i + 1}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">{c.label}</span>
              <h3 className="mt-3 text-xl font-bold text-foreground">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              <span className="mt-6 flex items-center justify-between border-t border-hairline pt-4 text-sm font-semibold text-gold">
                Open free lesson
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Difference ---------- */
const nowRows = [
  "Forty students and one pace, which is never yours.",
  "Memorize the format of the answer and hope the question matches.",
  "Past papers on repeat until you have accidentally learned the answers.",
  "You discover you are behind when the mock comes back.",
  "Asking a question in front of everyone costs more than staying lost.",
];
const hereRows = [
  "Small enough that you can stop me in the middle of a sentence.",
  "You learn where every figure comes from, so any wording works.",
  "Original questions, written for the topic you are actually stuck on.",
  "I know which topic is slipping by the second week, not in March.",
  "Asking twice is normal. Asking three times is fine too.",
];

function Tick() {
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-border bg-gold-tint">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FBC159" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8l3 3 5-7" />
      </svg>
    </span>
  );
}

export function Difference() {
  return (
    <section id="compare" className="bg-band-b py-[78px] md:py-[120px]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>The difference</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl text-foreground md:text-5xl">
            Same syllabus. Opposite experience.
          </h2>
        </div>

        <div className="relative mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-[20px] border border-hairline bg-card">
            <div className="border-b border-hairline px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-faint">What you have now</p>
              <h3 className="mt-2 text-2xl font-bold text-foreground">Most classes</h3>
            </div>
            <ul className="divide-y divide-hairline">
              {nowRows.map((r) => (
                <li key={r} className="flex items-start gap-4 px-6 py-4">
                  <Cross />
                  <span className="text-sm text-body">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative rounded-[20px] border border-gold-border bg-card-raised">
            <span
              aria-hidden
              className="absolute -top-10 -left-2 hidden rotate-[-6deg] font-hand text-2xl font-bold text-gold min-[900px]:flex min-[900px]:items-center min-[900px]:gap-2"
            >
              this is the whole thing
              <svg width="30" height="34" viewBox="0 0 30 34" fill="none">
                <path d="M15 2 C 8 12, 22 20, 15 30" stroke="#FBC159" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                <path d="M10 26 l5 6 5 -6" stroke="#FBC159" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
            <div className="border-b border-gold-border bg-gold-tint px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">What you get here</p>
              <h3 className="mt-2 text-2xl font-bold text-foreground">My class</h3>
            </div>
            <ul className="divide-y divide-hairline">
              {hereRows.map((r) => (
                <li key={r} className="flex items-start gap-4 px-6 py-4">
                  <Tick />
                  <span className="text-sm text-body">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Inside a lesson ---------- */
type TileKind = "class" | "clip" | "notes" | "practice" | "technique";

function TileArt({ kind }: { kind: TileKind }) {
  const stroke = "#FBC159";
  const soft = "rgba(255,255,255,0.06)";
  if (kind === "class") {
    return (
      <svg viewBox="0 0 400 500" className="h-full w-full" aria-hidden>
        <rect width="400" height="500" fill="#141618" />
        <rect x="30" y="30" width="340" height="220" rx="8" fill={soft} stroke={stroke} strokeWidth="1.5" />
        <text x="52" y="70" fill={stroke} fontSize="14" fontWeight="700">Trial Balance</text>
        {[110, 140, 170, 200].map((y) => (
          <g key={y}>
            <line x1="50" y1={y} x2="180" y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            <line x1="220" y1={y} x2="340" y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          </g>
        ))}
        {[{ x: 120, h: 60 }, { x: 200, h: 80 }, { x: 280, h: 70 }].map((p) => (
          <g key={p.x} transform={`translate(${p.x} ${430 - p.h})`}>
            <circle cx="0" cy="0" r="14" fill="none" stroke={stroke} strokeWidth="1.5" />
            <rect x="-14" y="14" width="28" height={p.h} fill="none" stroke={stroke} strokeWidth="1.5" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "notes") {
    return (
      <svg viewBox="0 0 400 260" className="h-full w-full" aria-hidden>
        <rect width="400" height="260" fill="#141618" />
        <polyline points="30,220 90,180 150,190 210,120 270,140 340,60" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {[[30, 220], [90, 180], [150, 190], [210, 120], [270, 140], [340, 60]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill={stroke} />
        ))}
        <line x1="20" y1="240" x2="380" y2="240" stroke="rgba(255,255,255,0.2)" />
      </svg>
    );
  }
  if (kind === "practice") {
    return (
      <svg viewBox="0 0 400 260" className="h-full w-full" aria-hidden>
        <rect width="400" height="260" fill="#141618" />
        <rect x="80" y="30" width="240" height="200" rx="6" fill={soft} stroke="rgba(255,255,255,0.2)" />
        {[70, 100, 130, 160, 190].map((y) => (
          <line key={y} x1="100" y1={y} x2="280" y2={y} stroke="rgba(255,255,255,0.25)" />
        ))}
        <circle cx="300" cy="200" r="26" fill={stroke} />
        <path d="M289 200l7 7 14-14" fill="none" stroke="#1b1e21" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "technique") {
    return (
      <svg viewBox="0 0 400 260" className="h-full w-full" aria-hidden>
        <rect width="400" height="260" fill="#141618" />
        <circle cx="200" cy="130" r="70" fill="none" stroke={stroke} strokeWidth="2" />
        <path d="M200 60 A 70 70 0 0 1 265 155" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        <polygon points="188,105 188,155 228,130" fill={stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 400 260" className="h-full w-full" aria-hidden>
      <rect width="400" height="260" fill="#141618" />
      <rect x="60" y="40" width="280" height="180" rx="8" fill={soft} stroke="rgba(255,255,255,0.2)" />
      <polygon points="180,110 180,170 235,140" fill={stroke} />
    </svg>
  );
}

const tiles: Array<{ caption: string; kind: TileKind; span?: string }> = [
  { caption: "A live class, mid lesson", kind: "class", span: "md:col-span-1 md:row-span-2" },
  { caption: "Clip: one topic explained", kind: "clip" },
  { caption: "Notes from a session", kind: "notes" },
  { caption: "Practice, marked and returned", kind: "practice" },
  { caption: "Clip: exam technique", kind: "technique" },
];

export function InsideClass() {
  return (
    <section id="inside" className="bg-band-c py-[78px] md:py-[120px]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>See a real class</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl text-foreground md:text-5xl">
            Inside a lesson.
          </h2>
        </div>
        <div className="mt-12 grid gap-4 md:auto-rows-[220px] md:grid-cols-3">
          {tiles.map((t) => (
            <div
              key={t.caption}
              className={`group relative overflow-hidden rounded-[20px] border border-hairline bg-card-raised transition-all hover:-translate-y-1 hover:border-gold-border ${t.span ?? ""}`}
            >
              <div className="absolute inset-0">
                <TileArt kind={t.kind} />
              </div>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-[rgba(255,255,255,0.08)] to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[rgba(20,22,24,0.95)] via-[rgba(20,22,24,0.6)] to-transparent p-5">
                <p className="text-sm font-semibold text-foreground">{t.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Meet the teacher ---------- */
export function MeetHamza() {
  return (
    <section id="meet" className="relative overflow-hidden bg-band-b py-[78px] md:py-[120px]">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-16">
        <div className="relative mx-auto w-full max-w-sm md:mx-0">
          <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gold-tint blur-2xl" aria-hidden />
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] border border-dashed border-hairline-strong bg-card">
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-br from-[#2a2d31] via-[#1b1e21] to-[#141618]"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold-border bg-gold-tint text-gold">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-faint">
                Photo goes here
              </span>
            </div>
            <span className="absolute bottom-4 left-4 rounded-full border border-gold-border bg-[rgba(20,22,24,0.75)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold backdrop-blur">
              ACCA Affiliate
            </span>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
            The person on the other end
          </p>
          <h2 className="mt-4 max-w-[22ch] text-3xl leading-[1.05] text-foreground md:text-5xl">
            I teach the way I wish someone had taught me.
          </h2>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-body md:text-base">
            <p>
              I sat where you are. Same subjects. Same textbooks. Same knot in my stomach on
              paper-two morning. I cleared the ACCA exams, and by the end I had figured out what the
              good teachers were doing that the others were not.
            </p>
            <p>
              This is that method. Not a franchise. Not a lecture hall. One classroom, three
              subjects, and enough seats that I remember which topic{" "}
              <span className="italic text-foreground">you</span> were stuck on last Tuesday.
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4">
            {[
              { k: "Students taught", v: "100+" },
              { k: "Years teaching", v: "4+" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-hairline bg-card p-4">
                <dd className="text-2xl font-bold text-foreground">{s.v}</dd>
                <dt className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">
                  {s.k}
                </dt>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <PillButton
              magnetic
              onClick={() => document.getElementById("picker")?.scrollIntoView({ behavior: "smooth" })}
            >
              Take my class for a spin
              <span aria-hidden>→</span>
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Reviews ---------- */
/** `src`: paste a YouTube/Vimeo/.mp4 URL to make the card playable. */
type VideoReview = { name: string; meta: string; quote: string; src?: string; poster?: string };
type TextReview = {
  name: string;
  meta: string;
  quote: string;
  from: "WhatsApp" | "Instagram";
};

const videoReviews: VideoReview[] = [
  {
    name: "Ayesha",
    meta: "AS · Accounting",
    quote: "I actually enjoy Accounting now. I never thought I would type that sentence.",
    // src: "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  },
  {
    name: "Zain",
    meta: "A2 · Business",
    quote: "The mock jumped from a C to an A in six weeks. My mum still doesn't believe it.",
    // src: "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  },
];

const textReviews: TextReview[] = [
  {
    name: "Fatima",
    meta: "O Level · Economics",
    from: "WhatsApp",
    quote: "sir the diagram thing finally clicked!! did the whole past paper and got 38/40 😭 thank youuu",
  },
  {
    name: "Bilal's dad",
    meta: "Parent",
    from: "WhatsApp",
    quote: "Whatever you are doing, keep doing it. He used to hide his report card. Now he leaves it on the table.",
  },
  {
    name: "Hira",
    meta: "IGCSE · Accounting",
    from: "Instagram",
    quote: "the way you explain WHY debits go on the left is unreal, no teacher ever told me that in 2 years lol",
  },
  {
    name: "Umar",
    meta: "A2 · Business",
    from: "WhatsApp",
    quote: "you were right about the evaluation phrases, examiner literally ticked every one. A* alhamdulillah 🙏",
  },
];

function VideoReviewCard({ r }: { r: VideoReview }) {
  return (
    <figure className="group relative flex flex-col overflow-hidden rounded-[24px] border border-hairline bg-card">
      <div className="relative aspect-[9/12] w-full overflow-hidden bg-band-c">
        <VideoPlayer
          src={r.src}
          poster={r.poster}
          title={`Review from ${r.name}`}
          label="Clip coming soon"
        />
        <span className="pointer-events-none absolute left-4 top-4 rounded-full border border-gold-border bg-[rgba(20,22,24,0.7)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold backdrop-blur">
          Video
        </span>
      </div>
      <figcaption className="flex flex-col gap-3 p-5">
        <p className="text-[15px] leading-relaxed text-body">&ldquo;{r.quote}&rdquo;</p>
        <div className="flex items-center justify-between border-t border-hairline pt-3">
          <span className="text-sm font-semibold text-foreground">{r.name}</span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-faint">{r.meta}</span>
        </div>
      </figcaption>
    </figure>
  );
}

/** Rotations are fixed per index so the wall reads as pinned screenshots. */
const ROTATIONS = ["md:-rotate-[1.2deg]", "md:rotate-[0.8deg]", "md:-rotate-[0.6deg]", "md:rotate-[1.4deg]"];

function TextReviewCard({ r, i }: { r: TextReview; i: number }) {
  return (
    <figure
      className={`relative flex flex-col overflow-hidden rounded-[20px] border border-hairline bg-card-raised p-5 shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-1 ${ROTATIONS[i % 4]}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
            r.from === "WhatsApp"
              ? "border border-gold-border bg-gold-tint text-gold"
              : "border border-hairline-strong text-faint"
          }`}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {r.from}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-faint">Screenshot</span>
      </div>
      <blockquote className="mt-4 text-[15px] leading-relaxed text-body">
        &ldquo;{r.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-hairline pt-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-tint text-xs font-bold text-gold">
          {r.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
          <p className="truncate text-[11px] uppercase tracking-[0.2em] text-faint">{r.meta}</p>
        </div>
      </figcaption>
    </figure>
  );
}

export function Reviews() {
  return (
    <section id="reviews" className="bg-band-a py-[78px] md:py-[120px]">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>In their own words</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[24ch] text-3xl text-foreground md:text-5xl">
            The students who used to hate this subject.
          </h2>
          <p className="mx-auto mt-4 max-w-[46ch] text-muted-foreground">
            Two of them said it on camera. The rest are the messages that pinged my phone on results
            day.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {videoReviews.map((r) => (
            <VideoReviewCard key={r.name} r={r} />
          ))}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {textReviews.map((r, i) => (
            <TextReviewCard key={r.name} r={r} i={i} />
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-faint">
          Names shortened, screenshots redacted for privacy. Originals available on request.
        </p>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
const faqs: Array<{ q: string; a: string }> = [
  {
    q: "How is a trial lesson actually free? What's the catch?",
    a: "No catch. You pick a subject and a level, watch a full recorded lesson, and decide. If it clicks, message me. If it doesn't, nothing happens and I don't chase you. That's it.",
  },
  {
    q: "I'm starting from zero. Is that a problem?",
    a: "That's actually easier for me than fixing a shaky foundation. We start at the reason a topic exists, then walk into the mechanics. You will not feel behind.",
  },
  {
    q: "My exam is in a few weeks. Am I too late?",
    a: "Depends on where you are, but usually no. We triage what matters, drill the mark-scheme moves, and leave the rest. Message me your paper and level and I'll tell you honestly.",
  },
  {
    q: "Online or in person? How does a class actually run?",
    a: "Small live groups on Zoom, camera on, screen shared. You can interrupt me whenever you want. Every session is recorded and sent to you the same night.",
  },
  {
    q: "How much does it cost after the trial?",
    a: "It depends on level and how many subjects you take. I don't hide the number, but I'd rather quote you after I know what you actually need. Ask on WhatsApp and I'll send fees.",
  },
  {
    q: "What if my parents want to speak to you first?",
    a: "Please. That's how most families start. I'll happily jump on a five-minute call before you commit to anything.",
  },
];

function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between gap-6 py-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <span className="min-w-0 text-base font-semibold text-foreground md:text-lg">{q}</span>
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline-strong transition-all ${
            open
              ? "rotate-45 border-gold-border bg-gold-tint text-gold"
              : "text-faint group-hover:border-gold-border group-hover:text-gold"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 1v12M1 7h12" />
          </svg>
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-[62ch] pr-12 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  return (
    <section id="faq" className="bg-band-b py-[78px] md:py-[120px]">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] md:gap-16">
        <div>
          <Eyebrow>Fair questions</Eyebrow>
          <h2 className="mt-4 text-3xl leading-[1.05] text-foreground md:text-4xl">
            The things you were about to WhatsApp me anyway.
          </h2>
          <p className="mt-4 max-w-[38ch] text-muted-foreground">
            If it isn&apos;t here, send it over. I answer everything myself, usually within a few
            hours.
          </p>
          <a
            href={waLink()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_click", { from: "faq" })}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold-border bg-gold-tint px-4 py-2 text-xs font-semibold text-gold transition-colors hover:bg-[rgba(251,193,89,0.18)]"
          >
            Ask on WhatsApp
            <span aria-hidden>→</span>
          </a>
        </div>
        <div>
          {faqs.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Closing CTA ---------- */
export function Closing() {
  return (
    <section className="bg-band-c py-[78px] md:py-[120px]">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <Eyebrow>Last thing</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-[18ch] text-4xl text-foreground md:text-6xl">
          Twenty minutes. Then you will know.
        </h2>
        <p className="mx-auto mt-5 max-w-[48ch] text-muted-foreground">
          Watch one lesson and find out whether the last two years of confusion were ever your fault.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PillButton
            magnetic
            onClick={() => document.getElementById("picker")?.scrollIntoView({ behavior: "smooth" })}
          >
            Pick my class
          </PillButton>
          <PillButton
            variant="ghost"
            href={waLink()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_click", { from: "closing" })}
          >
            Ask me something first
          </PillButton>
        </div>
      </div>
    </section>
  );
}
