"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { PillButton } from "./PillButton";
import { VideoPlayer } from "./VideoPlayer";
import { useBooking } from "./BookingModal";
import { SHOT_RATIO, SHOTS as shots, VIDEO_REVIEWS as videoReviews, type VideoReview } from "@/lib/reviews";
import { FAQS as faqs, posterFor, type LevelName, type SubjectName } from "@/lib/landing";
import { SUBJECT_PAGES } from "@/lib/subjects";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{children}</p>
  );
}



/* ---------- Picker ---------- */
const SUBJECTS: SubjectName[] = ["Accounting", "Business", "Economics"];

type LevelCard = { level: LevelName; label: string; title: string; body: string };

const LEVEL_CARDS: Record<SubjectName, LevelCard[]> = {
  Accounting: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Start from zero. Double entry, the trial balance and final accounts." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Partnerships, companies, and the ratios that come up every year." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Manufacturing accounts, investment appraisal and the big-mark questions." },
  ],
  Business: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Types of business, the marketing mix, and how firms make decisions." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Motivation, cash flow, and answers built the way the mark scheme wants." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Strategy, stakeholders and the long case study." },
  ],
  Economics: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Supply, demand, and why prices go up and down." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Elasticity, market failure, and drawing diagrams fast." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Government policy, trade, and evaluation answers." },
  ],
};

export function FreeLesson() {
  const [subject, setSubject] = useState<SubjectName>("Accounting");
  const [pickedOnce, setPickedOnce] = useState(false);
  const { open } = useBooking();
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
    <section id="picker" className="py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>Your free lesson</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl text-foreground md:text-5xl">
            Pick your subject and level.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-balance text-[17px] text-muted-foreground">
            Free trial lesson in O Level, IGCSE, AS or A Level Accounting, Business or Economics.
          </p>
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


        {/* Keyed on subject so the level cards remount and replay `float-in` */}
        <div key={subject} className="mt-8 grid gap-3 md:mt-10 md:grid-cols-3 md:gap-5">
          {cards.map((c, i) => {
            return (
              <button
                key={c.level}
                type="button"
                aria-haspopup="dialog"
                onClick={() => open({ from: "home_picker", subject, level: c.level })}
                data-spot className="group float-in relative flex flex-col overflow-hidden rounded-[18px] border border-hairline bg-card p-5 text-left transition-all md:rounded-[20px] md:p-7 hover:-translate-y-1 hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                style={{ animationDelay: `${0.05 + i * 0.09}s` }}
              >
                <span aria-hidden className="pointer-events-none absolute right-4 top-2 select-none text-[80px] font-bold leading-none text-white opacity-[0.03] md:text-[120px]">
                  {i + 1}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{c.label}</span>
                <span className="mt-1 text-xs tabular-nums text-faint">
                  Cambridge {SUBJECT_PAGES.find((p) => p.subject === subject)?.levels.find((l) => l.level === c.level)?.codes.replace(/O Level |IGCSE |AS Level |A Level /g, "")}
                </span>
                <span className="mt-2 text-lg font-bold text-foreground md:mt-3 md:text-xl">{c.title}</span>
                <span className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground md:mt-2 md:text-[15px]">{c.body}</span>
                <span className="mt-4 flex items-center justify-between border-t border-hairline pt-3 text-[15px] font-semibold text-gold md:mt-6 md:pt-4">
                  Pick a time
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </span>
              </button>
            );
          })}
        </div>

      </div>
    </section>
  );
}

/* ---------- Difference ---------- */
/** Phone table rows: what most classes do, and what mine do instead. */
const COMPARE: Array<[string, string]> = [
  ["40 students, one pace for all", "A small group. Stop me any time"],
  ["Memorise answers and hope they match", "Learn why, so new questions make sense"],
  ["You find out you're behind at the mock", "I spot a weak topic in week two"],
  ["Scared to ask in front of everyone", "Ask as many times as you need"],
];

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full sm:h-6 sm:w-6 ${
        ok ? "bg-gold text-[#1b1e21]" : "border border-[rgba(224,133,133,0.45)] text-[#e08585]"
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {ok ? <path d="M2.5 6.5l2.5 2.5 4.5-6" /> : <path d="M3 3l6 6M9 3l-6 6" />}
      </svg>
    </span>
  );
}

/* Desktop: two cards side by side (as approved). Phones: one compact table. */
const nowRows = [
  "40 students, all taught at one pace.",
  "You memorise answers and hope the question matches.",
  "You find out you're behind when your mock comes back.",
  "Asking a question in front of everyone feels scary.",
];
const hereRows = [
  "A small group. You can stop me any time.",
  "You learn why things work, so new questions don't throw you.",
  "I spot a weak topic in week two, not in March.",
  "Ask as many times as you need.",
];

function Cross() {
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(224,133,133,0.4)]">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#e08585" strokeWidth="2" strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </span>
  );
}

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
    <section id="compare" className="py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>How it&apos;s different</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl text-foreground md:text-5xl">
            Most classes vs my class.
          </h2>
        </div>

        {/* Phones: side-by-side table */}
        <div className="mt-8 overflow-hidden rounded-[18px] border border-hairline bg-card/80 backdrop-blur-sm md:hidden">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="px-3 py-3 text-sm font-bold text-muted-foreground">Most classes</th>
                <th scope="col" className="border-l border-gold-border bg-gold-tint px-3 py-3 text-sm font-bold text-foreground">My class</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([now, here]) => (
                <tr key={now} className="border-t border-hairline">
                  <td className="px-3 py-3 align-top">
                    <span className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
                      <Mark ok={false} />
                      {now}
                    </span>
                  </td>
                  <td className="border-l border-gold-border bg-gold-tint/60 px-3 py-3 align-top">
                    <span className="flex items-start gap-2 text-[13px] font-medium leading-snug text-foreground">
                      <Mark ok />
                      {here}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Desktop: two cards */}
        <div className="relative mt-10 hidden gap-5 md:grid md:grid-cols-2">
          <div data-spot className="rounded-[20px] border border-hairline bg-card">
            <div className="border-b border-hairline px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-faint">What you have now</p>
              <h3 className="mt-2 text-2xl font-bold text-foreground">Most classes</h3>
            </div>
            <ul className="divide-y divide-hairline">
              {nowRows.map((r) => (
                <li key={r} className="flex items-start gap-4 px-6 py-4">
                  <Cross />
                  <span className="text-[15px] leading-relaxed text-body">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div data-spot className="relative rounded-[20px] border border-gold-border bg-card-raised">
            <div className="border-b border-gold-border bg-gold-tint px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">What you get here</p>
              <h3 className="mt-2 text-2xl font-bold text-foreground">My class</h3>
            </div>
            <ul className="divide-y divide-hairline">
              {hereRows.map((r) => (
                <li key={r} className="flex items-start gap-4 px-6 py-4">
                  <Tick />
                  <span className="text-[15px] leading-relaxed text-body">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Meet the teacher ---------- */
export function MeetHamza() {
  const { open } = useBooking();
  return (
    <section id="meet" className="relative overflow-hidden py-14 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-16">
        <div className="relative mx-auto w-full max-w-[240px] sm:max-w-xs md:mx-0 md:max-w-sm">
          <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gold-tint blur-2xl" aria-hidden />
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] border border-hairline-strong bg-card">
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-br from-[#2a2d31] via-[#1b1e21] to-[#141618]"
            />
            <Image
              src="/hamza.jpg"
              alt="Hamza, online O Level and A Level Accounting, Business and Economics tutor"
              fill
              priority
              sizes="(max-width: 768px) 90vw, 384px"
              className="object-cover object-top"
            />
            <span className="absolute bottom-4 left-4 rounded-full border border-gold-border bg-[rgba(20,22,24,0.75)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold backdrop-blur">
              ACCA Affiliate
            </span>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
            Your teacher
          </p>
          <h2 className="mt-4 max-w-[22ch] text-3xl leading-[1.05] text-foreground md:text-5xl">
            I teach the way I wish someone had taught me.
          </h2>
          <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-body">
            <p>
              I teach Accounting, Business and Economics online in small groups, so I know which topic you got
              stuck on last week.
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { k: "In these subjects", v: "Straight A's" },
              { k: "Students taught", v: "100+" },
              { k: "Years teaching", v: "4+" },
            ].map((s) => (
              <div key={s.k} className="flex flex-col-reverse rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
                <dt className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint sm:text-[11px] sm:tracking-[0.2em]">
                  {s.k}
                </dt>
                <dd className={`text-lg font-bold leading-tight sm:text-2xl ${s.v === "Straight A's" ? "text-gold" : "text-foreground"}`}>{s.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <PillButton magnetic onClick={() => open({ from: "meet" })}>
              Book your free trial lesson
              <span aria-hidden>→</span>
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Reviews ---------- */
/**
 * Each card is exactly the shape of its video or screenshot (no empty bands),
 * and every card in a row shares one height, set by --rh on the row.
 */
function sized(ratio: number) {
  return { width: `calc(var(--rh) * ${ratio})` } as const;
}

export function VideoReviewCard({ r }: { r: VideoReview }) {
  return (
    <figure
      data-spot
      style={sized(r.ratio)}
      className="max-w-full overflow-hidden rounded-[12px] border border-hairline bg-card/80 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-gold-border sm:rounded-[18px]"
    >
      <div className="relative w-full overflow-hidden bg-band-c" style={{ aspectRatio: r.ratio }}>
        <VideoPlayer
          src={r.src}
          poster={r.poster ?? (r.src ? posterFor(r.src) : undefined)}
          title={r.name ? `Review from ${r.name}` : `Student review: ${r.meta.toLowerCase()}`}
          label="Clip coming soon"
        />
      </div>
      {r.name && (
        <figcaption className="flex items-center justify-between gap-2 px-3.5 py-2.5">
          <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-faint">{r.meta}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** A WhatsApp screenshot, whole, at its own shape. Tap for full size. */
function ShotCard({ s }: { s: (typeof shots)[number] }) {
  return (
    <figure
      data-spot
      style={sized(SHOT_RATIO)}
      className="max-w-full overflow-hidden rounded-[12px] border border-hairline bg-card/80 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-gold-border sm:rounded-[18px]"
    >
      <a
        href={s.src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${s.name}'s message full size`}
        className="group relative block focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <Image src={s.src} alt={s.alt} width={900} height={1524} sizes="(max-width: 768px) 45vw, 260px" className="h-auto w-full" />
        {/* Name sits on the image, so the card stays exactly the screenshot's shape. */}
        <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-linear-to-t from-[rgba(15,17,19,0.95)] via-[rgba(15,17,19,0.6)] to-transparent px-3.5 pb-3 pt-10">
          <span className="truncate text-sm font-semibold text-foreground">{s.name}</span>
          <span className="hidden shrink-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">{s.meta}</span>
        </figcaption>
      </a>
    </figure>
  );
}

export function Reviews() {
  // One wall, videos first, then voice notes, then messages. Every card shares
  // one height (--rh) and keeps its own shape, so rows have no empty space.
  const videos = videoReviews.filter((v) => v.kind === "video");
  const voices = videoReviews.filter((v) => v.kind === "voice");

  return (
    <section id="reviews" className="py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>Reviews</Eyebrow>
          <h2 className="mx-auto mt-4 text-3xl text-foreground md:text-5xl">What my students say.</h2>
        </div>

        {/* Phones: three tidy runs (videos 3 across, voice notes, messages 3 across),
            each with its own height. Larger screens: one mixed wall at one height. */}
        <div className="mt-8 flex flex-wrap items-start justify-center gap-2 sm:gap-4 sm:[--rh:280px] md:mt-12 md:[--rh:320px]">
          {videos.map((r) => (
            <div key={r.src} className="max-sm:[--rh:178px]">
              <VideoReviewCard r={r} />
            </div>
          ))}
          <span aria-hidden className="h-0 basis-full sm:hidden" />
          {voices.map((r) => (
            <div key={r.src} className="max-sm:[--rh:104px]">
              <VideoReviewCard r={r} />
            </div>
          ))}
          <span aria-hidden className="h-0 basis-full sm:hidden" />
          {shots.map((s) => (
            <div key={s.src} className="max-sm:[--rh:170px]">
              <ShotCard s={s} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqItem({ q, a, defaultOpen, last }: { q: string; a: string; defaultOpen?: boolean; last?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={last ? "" : "border-b border-hairline"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between gap-4 py-4 text-left md:gap-6 md:py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
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
          <p className="max-w-[62ch] pr-10 text-[15px] leading-relaxed text-muted-foreground md:pr-12 md:text-[17px]">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  return (
    <section id="faq" className="py-14 md:py-20">
      <div className="mx-auto max-w-3xl px-5">
        <div className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl leading-[1.05] text-foreground md:text-5xl">
            Questions people ask me.
          </h2>
        </div>
        <div data-spot className="mt-10 rounded-[24px] border border-hairline bg-card/60 px-6 backdrop-blur-sm md:px-10">
          {faqs.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} last={i === faqs.length - 1} />
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <p className="text-[17px] text-muted-foreground">
            Something else? Tap the WhatsApp button and ask me. I reply myself, usually within a few hours.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Closing CTA ---------- */
export function Closing() {
  const { open } = useBooking();
  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <Eyebrow>Free trial lesson</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-[18ch] text-4xl text-foreground md:text-6xl">
          Try a lesson before you decide.
        </h2>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PillButton magnetic onClick={() => open({ from: "closing" })}>
            Book your free trial lesson
          </PillButton>

        </div>
      </div>
    </section>
  );
}
