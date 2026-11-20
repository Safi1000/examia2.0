import Link from "next/link";
import type { ReactNode } from "react";
import { WordsStagger } from "@/components/spell/words-stagger";
import { SwipeItem, SwipeRow } from "./ReviewSlider";
import { BackPlate, Chip, Stage, Tick, after, hand, plate } from "./Vignette";

/**
 * "Inside my classes": five things a student gets, each with a small drawing
 * of what it looks like, so it reads at a glance. Every drawing is made from
 * the shared kit in Vignette.tsx. The numbers inside the drawings are examples
 * of the layout, not real results.
 */

function Card({ title, text, art }: { title: string; text: string; art: ReactNode }) {
  // Phones: one row of identical cards (same picture shape, title room for two
  // lines), so titles and text start at the same height in every card.
  return (
    <div data-reveal className="pc-surface flex flex-1 flex-col overflow-hidden rounded-card">
      <Stage className="px-4 max-md:h-[272px] md:h-64 md:px-6">
        <div className="flex w-full justify-center">{art}</div>
      </Stage>
      <div className="p-5 md:p-6">
        <h3 className="text-lg leading-snug max-md:min-h-[2lh]">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground md:mt-1.5">{text}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 1. the live class
   My board mid lesson: a real straight line depreciation working in my hand,
   a question from the class and my answer. No photo, no made up names. */
const SEATS = ["A", "M", "S", "Z", "R"];

function LiveArt() {
  return (
    <div className="relative w-full max-w-[380px] md:max-w-[440px]">
      <BackPlate className="inset-x-5 -top-2.5 bottom-6" />
      <div className={`relative overflow-hidden ${plate}`}>
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute h-2 w-2 rounded-full bg-gold/25" />
              <span className="h-1 w-1 rounded-full bg-gold" />
            </span>
            Live class
            <span className="font-normal text-faint">AS Accounting</span>
          </span>
          <span className="flex items-center">
            {SEATS.map((i) => (
              <span
                key={i}
                className="-ml-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-[#282b2f] bg-[#3a3f44] text-[9px] font-semibold text-body first:ml-0"
              >
                {i}
              </span>
            ))}
          </span>
        </div>

        {/* The board: faint ruled paper, my working, the answer underlined once in gold. */}
        <div className="relative px-3.5 pb-3 pt-3 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] [background-position:0_10px] [background-size:100%_26px]">
          <p className={`${hand} text-[20px] text-foreground`}>Depreciation, straight line</p>
          <p className={`${hand} mt-[7px] text-[20px] tabular-nums text-muted-foreground`}>
            (50,000 <span className="text-foreground">− 5,000</span>) ÷ 5 years
          </p>
          <p className={`${hand} mt-[7px] flex items-end gap-2 text-[22px] tabular-nums text-foreground`}>
            <span>
              ={" "}
              <span className="relative inline-block">
                9,000 a year
                <svg className="absolute -bottom-1.5 left-0 w-full" height="7" viewBox="0 0 120 7" fill="none" preserveAspectRatio="none">
                  <path d="M2 4.5 C 28 1.5, 62 6.5, 118 2.5" stroke="#FBC159" strokeWidth="2.6" strokeLinecap="round" pathLength={1} className="va-draw" style={after(450)} />
                </svg>
              </span>
            </span>
            {/* the pen, just lifted */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="va-pop mb-1 text-gold" style={after(1150)} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20l1.2-4.6L16.4 4.2a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" />
              <path d="M14.5 6.1l3.4 3.4" />
            </svg>
          </p>
        </div>

        {/* A question from the class, answered on the spot. */}
        <div className="space-y-1.5 border-t border-white/[0.07] bg-black/15 px-3.5 py-2.5">
          <p className="va-rise flex items-center gap-2 text-[11px] text-muted-foreground" style={after(800)}>
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#3a3f44] text-[9px] font-semibold text-body">S</span>
            <span className="truncate rounded-full border border-white/[0.07] bg-white/[0.045] px-2.5 py-[5px] leading-none">Why take off the 5,000 first?</span>
          </p>
          <p className="va-rise flex items-center justify-end gap-2 text-[11px] text-foreground" style={after(1350)}>
            <span className="truncate rounded-full border border-gold-border bg-gold-tint px-2.5 py-[5px] leading-none">Good question. Watch this.</span>
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-gold text-[9px] font-bold text-band-b shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">H</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 2. the recording
   The same lesson, kept: a still of the board, a scrubber with the lesson's
   parts marked, and how long it stays open. */
function RecordedArt() {
  return (
    <div className="relative w-full max-w-[252px]">
      <BackPlate className="inset-x-4 -top-2 bottom-5" />
      <div className={`relative p-1.5 ${plate}`}>
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.06] bg-[linear-gradient(180deg,#191b1e,#131517)]">
          {/* a faint still of the board behind the button */}
          <svg className="absolute inset-0 h-full w-full opacity-[0.33]" viewBox="0 0 220 124" fill="none" strokeLinecap="round">
            <path d="M18 26 h70 M18 44 h112 M18 62 h54" stroke="#f0ede8" strokeWidth="2.2" />
            <path d="M18 74 C 30 71, 46 76, 62 72" stroke="#FBC159" strokeWidth="2" />
            <path d="M150 96 V30 M150 96 H204 M158 88 L196 40" stroke="#f0ede8" strokeWidth="1.6" />
          </svg>
          <span className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_50%,rgba(0,0,0,0.5),transparent)]" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gold text-band-b shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_0_0_5px_rgba(251,193,89,0.14)]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="ml-0.5"><path d="M3 1.6l9 5.4-9 5.4z" /></svg>
          </span>
          <span className="absolute bottom-1.5 right-1.5 rounded-[4px] bg-black/60 px-1.5 py-[3px] text-[10px] font-semibold tabular-nums leading-none text-body">40:00</span>
        </div>

        {/* scrubber with the lesson's three parts */}
        <div className="relative mx-2 mt-3 h-[3px] rounded-full bg-white/[0.09]">
          <span className="va-fill absolute inset-y-0 left-0 w-[38%] rounded-full bg-gold" style={after(350)} />
          <span className="absolute left-[38%] top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold bg-band-c" />
          <span className="absolute left-[70%] top-1/2 h-[7px] w-px -translate-y-1/2 bg-white/25" />
        </div>
        <div className="mx-2 mt-2 grid grid-cols-[38%_32%_30%] text-[10px] leading-none text-faint">
          <span className="text-body">Why</span>
          <span className="text-body">Method</span>
          <span className="text-right">Past paper</span>
        </div>

        <div className="-mx-1.5 -mb-1.5 mt-2.5 flex items-center justify-between gap-2 rounded-b-[13px] border-t border-white/[0.07] bg-black/15 px-3.5 py-2">
          <span className="text-[11px] font-semibold text-foreground">Today&apos;s lesson</span>
          <Chip>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4.6" /><path d="M6 3.4V6l1.8 1.2" /></svg>
            Open 48 hours
          </Chip>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 3. the weekly test
   Your paper, back from me: ticks and a cross in pen, a note in my hand in
   the margin, the score stamped in the corner. */
function PenMark({ ok, d }: { ok: boolean; d: number }) {
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ok ? (
        <path d="M2 7.2 C 3.4 8.4, 4.4 9.8, 5.2 11 C 7 6.6, 9.8 3.4, 13.2 1.6" stroke="#2f7d57" strokeWidth="1.9" pathLength={1} className="va-draw" style={after(d)} />
      ) : (
        <path d="M3 2.4 C 5.6 4.8, 8.6 8, 11.6 11 M11.8 2 C 9 4.8, 6 8, 3.2 11.2" stroke="#b4472f" strokeWidth="1.8" pathLength={1} className="va-draw" style={after(d)} />
      )}
    </svg>
  );
}

function TestArt() {
  return (
    <div className="relative w-full max-w-[214px]">
      {/* the sheet underneath */}
      <span className="absolute inset-0 translate-x-1.5 translate-y-1 rotate-[4deg] rounded-[6px] bg-[#cfccc4] shadow-[0_18px_26px_-16px_rgba(0,0,0,0.9)]" />
      <div className="relative -rotate-[1.5deg] rounded-[6px] bg-[linear-gradient(180deg,#f3f1eb,#e8e5dd)] px-3.5 pb-3 pt-3 text-[#26282b] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_20px_28px_-18px_rgba(0,0,0,0.95)]">
        {/* margin rule */}
        <span className="absolute inset-y-0 left-[26px] w-px bg-[#c98b7c]/55" />
        <div className="flex items-baseline justify-between border-b border-black/10 pb-1.5 pl-5">
          <span className="text-[11px] font-bold tracking-[-0.01em]">Weekly test</span>
        </div>
        {[true, false, true].map((ok, n) => (
          <div key={n} className="mt-2 flex items-center gap-2">
            <span className="w-3 text-right text-[10px] font-semibold tabular-nums text-black/45">{n + 1}</span>
            <span className="flex flex-1 flex-col gap-[5px] pl-1.5">
              <span className="h-[3px] rounded-full bg-black/[0.16]" />
              <span className={`h-[3px] rounded-full bg-black/[0.16] ${n === 1 ? "w-3/5" : "w-4/5"}`} />
            </span>
            <PenMark ok={ok} d={350 + n * 280} />
          </div>
        ))}
        <p className={`${hand} va-rise mt-2.5 pl-5 text-[15px] leading-[1.05] text-[#8a5a0c]`} style={after(1150)}>
          Q2: show your working,
          <br />
          it is worth 2 more.
        </p>
      </div>
      {/* the score, stamped */}
      <span style={after(1500)} className="va-stamp absolute -right-3.5 -top-4 flex h-[52px] w-[52px] rotate-[8deg] flex-col items-center justify-center rounded-full bg-gold text-band-b shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_0_0_3px_#FBC159,inset_0_0_0_4px_rgba(27,30,33,0.35),0_10px_18px_-8px_rgba(0,0,0,0.8)]">
        <b className="text-[17px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">17</b>
        <span className="mt-px border-t border-band-b/40 px-1 pt-px text-[10px] font-semibold leading-none tabular-nums">20</span>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- 4. the portal
   Your own page: each topic, how far you are, and what to work on next. */
const TOPICS = [
  { t: "Depreciation", v: 85 },
  { t: "Ratios", v: 60 },
  { t: "Partnerships", v: 40 },
];

function PortalArt() {
  return (
    <div className="relative w-full max-w-[252px]">
      <BackPlate className="inset-x-4 -top-2 bottom-5" />
      <div className={`relative overflow-hidden ${plate}`}>
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
          <span className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[conic-gradient(from_200deg,#FBC159,rgba(251,193,89,0.25)_45%,#FBC159_80%,rgba(251,193,89,0.4))] p-px">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-[#2a2e32] text-[9px] font-bold text-foreground">A</span>
            </span>
            <span className="text-[11px] font-semibold text-foreground">My progress</span>
          </span>
          <span className="text-[10px] text-faint">This term</span>
        </div>
        <div className="space-y-2.5 px-3.5 py-3">
          {TOPICS.map((x, i) => (
            <div key={x.t}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-body">{x.t}</span>
                <span className="font-semibold tabular-nums text-foreground">{x.v}%</span>
              </div>
              <div className="relative mt-1.5 h-[5px] rounded-full bg-white/[0.08]">
                <span className="va-fill absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#e0a53f,#FBC159)]" style={{ width: `${x.v}%`, ...after(300 + i * 160) }} />
                {/* the 70% line: strong from here */}
                <span className="absolute left-[70%] top-1/2 h-[9px] w-px -translate-y-1/2 bg-white/30" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.07] bg-black/15 px-3.5 py-2">
          <span className="text-[10px] text-faint">Work on next</span>
          <Chip gold>Partnerships</Chip>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 5. how marks are given
   A three mark answer the way an examiner reads it: the part of each line
   that earns the mark is marked in gold, with the mark in the margin. */
const LINES = [
  { w: "w-[88%]", from: "left-[8%]", span: "w-[34%]", what: "point" },
  { w: "w-[94%]", from: "left-[30%]", span: "w-[46%]", what: "why" },
  { w: "w-[72%]", from: "left-[18%]", span: "w-[40%]", what: "in context" },
];

function MarksArt() {
  return (
    <div className="relative w-full max-w-[252px]">
      <BackPlate className="inset-x-4 -top-2 bottom-5" />
      <div className={`relative overflow-hidden ${plate}`}>
        <div className="flex items-baseline justify-between border-b border-white/[0.07] px-3.5 py-2.5">
          <span className="text-[11px] font-semibold text-foreground">Your answer</span>
          <span className="text-[10px] tabular-nums text-faint">[3 marks]</span>
        </div>
        <div className="space-y-3 px-3.5 pb-3 pt-3.5">
          {LINES.map((l, i) => (
            <div key={l.what} className="flex items-center gap-2.5">
              <span className="relative block h-[5px] flex-1">
                <span className={`absolute inset-y-0 left-0 rounded-full bg-white/[0.11] ${l.w}`} />
                <span className={`va-fill absolute -inset-y-[3px] rounded-[4px] bg-gold/20 ring-1 ring-gold/45 ${l.from} ${l.span}`} style={after(300 + i * 300)} />
              </span>
              <span className="flex w-[70px] shrink-0 items-center justify-end gap-1.5">
                <span className={`${hand} va-rise text-[13px] text-gold`} style={after(500 + i * 300)}>{l.what}</span>
                <Tick size={13} d={600 + i * 300} />
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.07] bg-black/15 px-3.5 py-2">
          <span className="text-[10px] text-faint">One mark for each</span>
          <span className="relative px-1.5 text-[12px] font-extrabold tabular-nums tracking-[-0.02em] text-gold">
            3 / 3
            <svg className="absolute -inset-x-1 -inset-y-1.5 h-[calc(100%+12px)] w-[calc(100%+8px)]" viewBox="0 0 48 26" fill="none" preserveAspectRatio="none">
              <path d="M6 14 C 5 6, 18 2, 28 3 C 40 4, 45 9, 43 15 C 41 22, 26 24, 15 22 C 8 21, 4 18, 7 11" stroke="rgba(251,193,89,0.75)" strokeWidth="1.2" strokeLinecap="round" pathLength={1} className="va-draw" style={after(1500)} />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

export function InsideLesson() {
  return (
    <section id="inside" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div data-reveal className="text-center">
          <p className="text-sm font-semibold text-faint">What you get</p>
          <h2 id="inside-title" className="mx-auto mt-4 max-w-[22ch] text-[2rem] leading-[1.08] md:text-5xl">
            <WordsStagger className="justify-center">Inside my classes.</WordsStagger>
          </h2>
          <p className="mx-auto mt-4 max-w-[62ch] text-balance text-lg leading-relaxed text-muted-foreground">
            How my online classes work.
          </p>
        </div>
        <div className="mt-6 md:mt-12">
          <SwipeRow labelledBy="inside-title" className="md:grid md:grid-cols-3 md:gap-5">
            <SwipeItem className="md:col-span-2">
              <Card title="Small live classes" text="On Google Meet or Zoom, cameras on. Ask me anything, any time." art={<LiveArt />} />
            </SwipeItem>
            <SwipeItem>
              <Card title="Every class recorded" text="Missed a class? Watch it the same night. It stays open for 48 hours." art={<RecordedArt />} />
            </SwipeItem>
            <SwipeItem>
              <Card title="Weekly tests, marked by me" text="You see exactly where you lost marks." art={<TestArt />} />
            </SwipeItem>
            <SwipeItem>
              <Card title="Your own student portal" text="Your notes, tests and marks in one place." art={<PortalArt />} />
            </SwipeItem>
            <SwipeItem>
              <Card title="Answers that get marks" text="I show you how examiners mark, step by step." art={<MarksArt />} />
            </SwipeItem>
          </SwipeRow>
        </div>
        <p className="mt-8 text-center">
          <Link
            href="/online-classes"
            className="inline-flex min-h-11 items-center gap-1.5 text-base font-semibold text-body underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            See the class times
            <span aria-hidden>→</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
