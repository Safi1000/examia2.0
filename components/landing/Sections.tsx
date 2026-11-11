"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState } from "react";
import { PillButton } from "./PillButton";
import { VideoPlayer } from "./VideoPlayer";
import { SwipeItem, SwipeRow } from "./ReviewSlider";
import { useBooking } from "./BookingModal";
import { SHOT_RATIO, SHOTS as shots, VIDEO_REVIEWS as videoReviews, type VideoReview } from "@/lib/reviews";
import { FAQS as faqs, posterFor, type LevelName, type SubjectName } from "@/lib/landing";
import { SUBJECT_PAGES } from "@/lib/subjects";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="pc-label">{children}</p>
  );
}



/* ---------- Picker ---------- */
const SUBJECTS: SubjectName[] = ["Accounting", "Business", "Economics"];

type LevelCard = { level: LevelName; label: string; title: string; body: string };

const LEVEL_CARDS: Record<SubjectName, LevelCard[]> = {
  Accounting: [
    { level: "O Level / IGCSE", label: "O Level / IGCSE", title: "The foundations", body: "Start from zero. Double entry, the trial balance and final accounts." },
    { level: "AS Level", label: "AS Level", title: "Building up", body: "Partnerships, companies, and the ratios that come up every year." },
    { level: "A2 Level", label: "A2 Level", title: "The hard marks", body: "Manufacturing accounts, investment appraisal and the questions worth the most marks." },
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
    <section id="picker" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>Your free lesson</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-[2rem] leading-[1.08] md:text-5xl">
            Pick your subject and level.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-balance text-[17px] leading-relaxed text-muted-foreground">
            Free trial lesson in O Level, IGCSE, AS or A Level Accounting, Business or Economics.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-6 flex items-center justify-center gap-3 text-sm md:mt-10">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold-border text-xs font-bold text-gold">1</span>
          <span className="font-semibold text-foreground">Subject</span>
          <span className="h-px w-10 bg-hairline-strong" />
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${pickedOnce ? "border border-gold-border text-gold" : "border border-hairline-strong text-faint"}`}>2</span>
          <span className={pickedOnce ? "font-semibold text-foreground" : "text-faint"}>Level</span>
        </div>

        {/* Tablist */}
        <div className="mt-8 flex justify-center">
          <div role="tablist" aria-label="Subject" className="inline-flex rounded-full border border-hairline bg-[rgba(20,22,24,0.6)] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
            {SUBJECTS.map((s, i) => {
              const active = s === subject;
              return (
                <button
                  key={s}
                  ref={(n) => {
                    tabRefs.current[i] = n;
                  }}
                  role="tab"
                  id={`picker-tab-${i}`}
                  aria-controls="picker-panel"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => onTabKey(e, i)}
                  onClick={() => {
                    setSubject(s);
                    setPickedOnce(true);
                  }}
                  className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:px-6 ${
                    active
                      ? "bg-[#33373c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.35)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>


        <div
          id="picker-panel"
          role="tabpanel"
          aria-labelledby={`picker-tab-${SUBJECTS.indexOf(subject)}`}
          className="mt-8 grid gap-3 md:mt-10 md:grid-cols-3 md:gap-5"
        >
          {cards.map((c) => {
            return (
              <button
                key={c.level}
                type="button"
                aria-haspopup="dialog"
                onClick={() => open({ from: "home_picker", subject, level: c.level })}
                className="pc-surface pc-surface-link group relative flex flex-col overflow-hidden rounded-[16px] p-4 text-left md:rounded-[20px] md:p-7 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <span className="pc-label">{c.label}</span>
                <span className="mt-1 text-xs tabular-nums text-faint">
                  Cambridge {SUBJECT_PAGES.find((p) => p.subject === subject)?.levels.find((l) => l.level === c.level)?.codes.replace(/O Level |IGCSE |AS Level |A Level /g, "")}
                </span>
                <span className="mt-3 text-lg font-extrabold tracking-[-0.02em] text-[#f0ede8] md:text-xl">{c.title}</span>
                <span className="mt-2 text-base leading-relaxed text-muted-foreground md:text-[15px]">{c.body}</span>
                <span className="mt-5 flex items-center justify-between border-t border-hairline pt-4 text-[15px] font-semibold text-gold md:mt-6">
                  Pick a time
                  <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
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
        ok ? "border border-gold-border bg-gold-tint text-gold" : "border border-[rgba(224,133,133,0.45)] text-[#e08585]"
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
    <section id="compare" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>How it&apos;s different</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-[2rem] leading-[1.08] md:text-5xl">
            Most classes vs my class.
          </h2>
        </div>

        {/* Phones: side-by-side table */}
        <div className="pc-surface mt-6 overflow-hidden rounded-[16px] md:hidden">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="px-3.5 py-3.5 text-sm font-bold text-muted-foreground">Most classes</th>
                <th scope="col" className="border-l border-hairline bg-[rgba(251,193,89,0.06)] px-3.5 py-3.5 text-sm font-bold text-[#f0ede8]">My class</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([now, here]) => (
                <tr key={now} className="border-t border-hairline">
                  <td className="px-3.5 py-3.5 align-top">
                    <span className="flex items-start gap-2 text-[14px] leading-snug text-muted-foreground">
                      <Mark ok={false} />
                      {now}
                    </span>
                  </td>
                  <td className="border-l border-hairline bg-[rgba(251,193,89,0.06)] px-3.5 py-3.5 align-top">
                    <span className="flex items-start gap-2 text-[14px] font-medium leading-snug text-[#f0ede8]">
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
        <div className="relative mt-12 hidden gap-5 md:grid md:grid-cols-2">
          <div className="pc-surface overflow-hidden rounded-[20px]">
            <div className="border-b border-hairline px-6 py-5">
              <p className="pc-label">What you have now</p>
              <h3 className="mt-2 text-2xl">Most classes</h3>
            </div>
            <ul className="divide-y divide-hairline">
              {nowRows.map((r) => (
                <li key={r} className="flex items-start gap-4 px-6 py-4">
                  <Cross />
                  <span className="text-base leading-relaxed text-muted-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pc-surface relative overflow-hidden rounded-[20px] border-gold-border!">
            <div className="border-b border-hairline bg-[rgba(251,193,89,0.06)] px-6 py-5">
              <p className="pc-label text-gold!">What you get here</p>
              <h3 className="mt-2 text-2xl">My class</h3>
            </div>
            <ul className="divide-y divide-hairline">
              {hereRows.map((r) => (
                <li key={r} className="flex items-start gap-4 px-6 py-4">
                  <Tick />
                  <span className="text-base leading-relaxed text-body">{r}</span>
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
    <section id="meet" className="relative overflow-hidden py-16 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-16">
        <div className="relative w-full md:max-w-sm">
          <div className="pc-frame relative aspect-square w-full md:aspect-[3/4] overflow-hidden rounded-[20px] bg-card">
            <div
              aria-hidden
              className="absolute inset-0 bg-linear-to-br from-[#2a2d31] via-[#1b1e21] to-[#141618]"
            />
            <Image
              src="/hamza.jpg"
              alt="Hamza, online O Level and A Level Accounting, Business and Economics tutor"
              fill
              sizes="(max-width: 768px) 90vw, 384px"
              className="object-cover object-top"
            />
            <span className="absolute bottom-4 left-4 rounded-full border border-hairline-strong bg-[rgba(20,22,24,0.8)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#f0ede8]">
              ACCA Affiliate
            </span>
          </div>
        </div>

        <div>
          <p className="pc-label">Your teacher</p>
          <h2 className="mt-4 max-w-[22ch] text-[2rem] leading-[1.08] md:text-5xl">
            I teach the way I wish someone had taught me.
          </h2>
          <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-body">
            <p>
              I teach Accounting, Business and Economics online in small groups, so I know which topic you got
              stuck on last week.
            </p>
          </div>

          <dl className="pc-surface mt-8 grid grid-cols-3 divide-x divide-hairline rounded-[16px]">
            {[
              { k: "In these subjects", v: "Straight As" },
              { k: "Students taught", v: "100+" },
              { k: "Years teaching", v: "4+" },
            ].map((s) => (
              <div key={s.k} className="flex flex-col-reverse px-3 py-4 sm:px-5">
                <dt className="mt-1 text-xs leading-snug text-faint">
                  {s.k}
                </dt>
                <dd className="whitespace-nowrap text-base font-extrabold leading-tight tracking-[-0.02em] tabular-nums text-[#f0ede8] sm:text-2xl">{s.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <PillButton className="max-sm:w-full" onClick={() => open({ from: "meet" })}>
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

/** The same name and level strip under every review, whatever its type. */
function ReviewCaption({ name, meta, tile = false }: { name: string; meta: string; tile?: boolean }) {
  // Phone tiles keep name over level at every phone width, with the card padding.
  return (
    <figcaption
      className={
        tile
          ? "flex flex-col gap-0.5 px-4 py-3"
          : "flex flex-col gap-0.5 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-3.5 sm:py-2.5"
      }
    >
      <span className={`truncate font-semibold text-[#f0ede8] ${tile ? "text-sm" : "text-xs sm:text-sm"}`}>{name || "Student"}</span>
      <span className="shrink-0 truncate text-xs text-faint">{meta}</span>
    </figcaption>
  );
}

/**
 * `tile`: the shape class for a phone swipe row, where every tile has the same
 * size. Without it the card keeps the video's own shape (the wall on wider screens).
 */
export function VideoReviewCard({ r, tile }: { r: VideoReview; tile?: string }) {
  return (
    <figure
      style={tile ? undefined : sized(r.ratio)}
      className={`pc-surface overflow-hidden rounded-[12px] transition-[border-color] duration-200 hover:border-[rgba(255,255,255,0.16)]! sm:rounded-[16px] ${
        tile ? "flex flex-1 flex-col" : "max-w-full"
      }`}
    >
      <div
        className={`relative w-full overflow-hidden bg-band-c ${tile ?? ""}`}
        style={tile ? undefined : { aspectRatio: r.ratio }}
      >
        <VideoPlayer
          src={r.src}
          poster={r.poster ?? (r.src ? posterFor(r.src) : undefined)}
          title={r.name ? `Review from ${r.name}` : `Student review: ${r.meta.toLowerCase()}`}
          label="Clip coming soon"
        />
      </div>
      <ReviewCaption name={r.name} meta={r.meta} tile={!!tile} />
    </figure>
  );
}

/** A WhatsApp screenshot, whole, at its own shape. Tap for full size. */
function ShotCard({ s, tile = false }: { s: (typeof shots)[number]; tile?: boolean }) {
  return (
    <figure
      style={tile ? undefined : sized(SHOT_RATIO)}
      className={`pc-surface overflow-hidden rounded-[12px] transition-[border-color] duration-200 hover:border-[rgba(255,255,255,0.16)]! sm:rounded-[16px] ${
        tile ? "flex flex-1 flex-col" : "max-w-full"
      }`}
    >
      <a
        href={s.src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${s.name}'s message full size`}
        className="group relative block focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        <Image src={s.src} alt={s.alt} width={900} height={1524} sizes="(max-width: 768px) 45vw, 260px" className="h-auto w-full" />
      </a>
      <ReviewCaption name={s.name} meta={s.meta} tile={tile} />
    </figure>
  );
}

export function Reviews() {
  const videos = videoReviews.filter((v) => v.kind === "video");
  const voices = videoReviews.filter((v) => v.kind === "voice");

  return (
    <section id="reviews" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <Eyebrow>Reviews</Eyebrow>
          <h2 className="mx-auto mt-4 text-[2rem] leading-[1.08] md:text-5xl">What my students say.</h2>
        </div>

        {/* Phones: one swipe row per kind of review (videos, voice notes,
            messages), every tile in a row the same size. */}
        <div className="mt-6 space-y-8 md:hidden">
          <SwipeRow label="Video reviews" size="tile">
            {videos.map((r) => (
              <SwipeItem key={r.src}>
                <VideoReviewCard r={r} tile="aspect-[9/16]" />
              </SwipeItem>
            ))}
          </SwipeRow>
          <SwipeRow label="Voice note reviews" size="tile">
            {voices.map((r) => (
              <SwipeItem key={r.src}>
                <VideoReviewCard r={r} tile="aspect-square" />
              </SwipeItem>
            ))}
          </SwipeRow>
          <SwipeRow label="Messages from students" size="tile">
            {shots.map((s) => (
              <SwipeItem key={s.src}>
                <ShotCard s={s} tile />
              </SwipeItem>
            ))}
          </SwipeRow>
        </div>

        {/* 768px and wider: one mixed wall. Every card shares one height (--rh)
            and keeps its own shape, so rows have no empty space. */}
        <div className="mt-12 hidden flex-wrap items-start justify-center gap-4 [--rh:320px] md:flex">
          {[...videos, ...voices].map((r) => (
            <div key={r.src}>
              <VideoReviewCard r={r} />
            </div>
          ))}
          {shots.map((s) => (
            <div key={s.src}>
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
  const panel = useId();
  return (
    <div className={last ? "" : "border-b border-hairline"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left md:gap-6 md:py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <span className="min-w-0 text-base font-semibold text-[#f0ede8] md:text-lg">{q}</span>
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-[transform,border-color,color] duration-300 ease-out motion-reduce:transition-none ${
            open
              ? "rotate-45 border-hairline-strong text-[#f0ede8]"
              : "border-hairline text-faint group-hover:border-hairline-strong group-hover:text-[#f0ede8]"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 1v12M1 7h12" />
          </svg>
        </span>
      </button>
      {/* Folded answers stay in the page (search engines read them) but are out of
          reach for screen readers and the keyboard until opened. */}
      <div
        id={panel}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] pb-6 opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="max-w-[62ch] pr-10 text-base leading-relaxed text-muted-foreground md:pr-12 md:text-[17px]">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  return (
    <section id="faq" className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <div className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-[2rem] leading-[1.08] md:text-5xl">
            Questions people ask me.
          </h2>
        </div>
        <div className="pc-surface mt-6 rounded-[20px] px-5 md:mt-12 md:px-10">
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
    <section className="py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <Eyebrow>Free trial lesson</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-[18ch] text-[2.25rem] leading-[1.06] md:text-6xl">
          Try a lesson before you decide.
        </h2>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <PillButton onClick={() => open({ from: "closing" })}>
            Book your free trial lesson
          </PillButton>

        </div>
      </div>
    </section>
  );
}
