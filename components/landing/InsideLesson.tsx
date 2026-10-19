import Image from "next/image";
import type { ReactNode } from "react";

/**
 * "Inside a lesson": five things a student gets, each with a small drawing of
 * what it looks like, so it reads at a glance. The numbers inside the drawings
 * are examples of the layout, not real results.
 */

function Card({
  title,
  text,
  art,
  wide = false,
  zoom,
}: {
  title: string;
  text: string;
  art: ReactNode;
  wide?: boolean;
  /** How much the drawing shrinks on phones so it fills its panel. Desktop is always full size. */
  zoom: number;
}) {
  return (
    <div
      data-spot
      className={`flex flex-col overflow-hidden rounded-[16px] border border-hairline bg-card md:rounded-[22px] ${wide ? "col-span-2" : ""}`}
    >
      <div aria-hidden className="relative flex items-center justify-center overflow-hidden bg-band-c px-2 py-3 md:h-56 md:px-5 md:py-0">
        <div className="flex w-full justify-center max-md:[zoom:var(--z)]" style={{ ["--z" as string]: zoom }}>
          {art}
        </div>
      </div>
      <div className="p-3.5 md:p-6">
        <h3 className="text-sm font-bold text-foreground md:text-lg">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground md:mt-1.5 md:text-[15px]">{text}</p>
      </div>
    </div>
  );
}

// A video-call screen: Hamza (a still from the intro video) and four students.
// Names and initials are placeholders, not real students.
const STUDENTS = [
  { i: "A", n: "Ayesha", c: "#7b61c9" },
  { i: "M", n: "Musa", c: "#2f8f83" },
  { i: "S", n: "Sara", c: "#c0587e" },
  { i: "Z", n: "Zain", c: "#4a78c2" },
];

function MicOff() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M9 9v3a3 3 0 0 0 5 2.2M15 9.3V5a3 3 0 0 0-5.7-1.3M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11.3 5.5M12 18v3M3 3l18 18" />
    </svg>
  );
}

function CallButton({ red = false, children }: { red?: boolean; children: ReactNode }) {
  return (
    <span
      className={`flex h-6 items-center justify-center rounded-full text-white ${red ? "w-9 bg-[#e5685a]" : "w-6 bg-[#3c4043]"}`}
    >
      {children}
    </span>
  );
}

function LiveArt() {
  return (
    <div className="w-full max-w-[372px] rounded-xl border border-hairline-strong bg-[#202124] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-1.5">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-[#0c1115] ring-2 ring-gold">
          {/* Whole head and shoulders in view; the sides fade into the frame's own dark background. */}
          <Image
            src="/live-hamza.jpg"
            alt=""
            fill
            sizes="260px"
            className="object-contain [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]"
          />
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">Hamza</span>
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold">
            <span className="flex h-2 items-end gap-[1.5px]">
              <span className="w-[2px] h-1 rounded-full bg-[#1b1e21]" />
              <span className="w-[2px] h-2 rounded-full bg-[#1b1e21]" />
              <span className="w-[2px] h-1.5 rounded-full bg-[#1b1e21]" />
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {STUDENTS.map((s) => (
            <span key={s.i} className="relative flex items-center justify-center rounded-lg bg-[#3c4043]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: s.c }}>
                {s.i}
              </span>
              <span className="absolute bottom-0.5 left-1 text-[7px] text-white/80">{s.n}</span>
              <span className="absolute right-0.5 top-0.5 text-white/70">
                <MicOff />
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-[#2d2e31] px-2 py-1.5 text-[10px] text-[#e8eaed]">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#c0587e] text-[8px] font-semibold text-white">S</span>
        <span className="truncate">
          <b className="font-semibold">Sara:</b> Can you explain that step again?
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-1">
        <span className="text-[9px] text-[#bdc1c6]">4:00 PM · Accounting, AS</span>
        <span className="flex items-center gap-1">
          <CallButton>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12z" /></svg>
          </CallButton>
          <CallButton>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" /></svg>
          </CallButton>
          <CallButton>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11h1V3.5a1.5 1.5 0 0 1 3 0V11h1V5.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-12.6 4.2L2.6 14a1.5 1.5 0 0 1 2.4-1.8L7 14.5z" /></svg>
          </CallButton>
          <CallButton red>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.2.3-4.6.7v3.1a1 1 0 0 1-.6.9 11 11 0 0 0-2.7 1.9 1 1 0 0 1-1.4 0L.3 13.2a1 1 0 0 1 0-1.4A16.9 16.9 0 0 1 12 7a16.9 16.9 0 0 1 11.7 4.8 1 1 0 0 1 0 1.4l-2.4 2.4a1 1 0 0 1-1.4 0 11 11 0 0 0-2.7-1.9 1 1 0 0 1-.6-.9V9.7C15.2 9.3 13.6 9 12 9z" /></svg>
          </CallButton>
        </span>
      </div>
    </div>
  );
}

function RecordedArt() {
  return (
    <div className="w-full max-w-[240px] rounded-xl border border-hairline-strong bg-card p-3 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <div className="flex aspect-video items-center justify-center rounded-lg bg-band-c">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-[#1b1e21]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5l9 5.5-9 5.5z" /></svg>
        </span>
      </div>
      <p className="mt-2.5 text-xs font-semibold text-foreground">Today&apos;s lesson</p>
      <p className="text-[11px] text-faint">Sent to you tonight</p>
      <div className="mt-2 h-1 rounded-full bg-card-raised">
        <div className="h-1 w-2/5 rounded-full bg-gold" />
      </div>
    </div>
  );
}

function TestArt() {
  return (
    <div className="relative w-full max-w-[220px] rounded-md bg-[#f4f1ea] p-4 text-[#2a2a2a] shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <p className="text-[11px] font-bold uppercase tracking-wider">Weekly test</p>
      {[1, 2, 3].map((n) => (
        <div key={n} className="mt-2.5 flex items-center gap-2">
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${n === 2 ? "bg-[#e5685a]" : "bg-[#3d9a6a]"}`}>
            {n === 2 ? "✕" : "✓"}
          </span>
          <span className="h-1.5 flex-1 rounded bg-black/15" />
        </div>
      ))}
      <p className="mt-2 border-l-2 border-[#8a5a0c] pl-2 text-[10px] leading-snug text-[#8a5a0c]">Q2: show your working for the 2 extra marks</p>
      <span className="absolute -right-3 -top-3 flex h-12 w-12 flex-col items-center justify-center rounded-full bg-gold text-[#1b1e21] shadow-lg">
        <b className="text-sm leading-none">17</b>
        <span className="text-[9px] leading-none">/20</span>
      </span>
    </div>
  );
}

const TOPICS = [
  { t: "Depreciation", v: 85 },
  { t: "Ratios", v: 60 },
  { t: "Partnerships", v: 40 },
];

function PortalArt() {
  return (
    <div className="w-full max-w-[240px] rounded-xl border border-hairline-strong bg-card p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <p className="text-xs font-semibold text-foreground">My progress</p>
      <div className="mt-3 space-y-2.5">
        {TOPICS.map((x) => (
          <div key={x.t}>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{x.t}</span>
              <span className="tabular-nums">{x.v}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-card-raised">
              <div className="h-1.5 rounded-full bg-gold" style={{ width: `${x.v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarksArt() {
  return (
    <div className="flex w-full max-w-[240px] items-end justify-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-bold tabular-nums text-muted-foreground">7</span>
        <span className="block h-16 w-12 rounded-t-lg bg-card-raised" />
        <span className="text-[11px] text-faint">Before</span>
      </div>
      <span className="mb-10 text-xl text-gold">→</span>
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-bold tabular-nums text-gold">11</span>
        <span className="block h-[104px] w-12 rounded-t-lg bg-gold" />
        <span className="text-[11px] text-faint">After</span>
      </div>
    </div>
  );
}

export function InsideLesson() {
  return (
    <section id="inside" className="py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">What you get</p>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-3xl text-foreground md:text-5xl">Inside my classes.</h2>
          <p className="mx-auto mt-4 max-w-3xl text-balance text-[17px] text-muted-foreground">
            How my online classes work.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 md:mt-10 md:grid-cols-3 md:gap-5">
          <Card wide zoom={0.82} title="Small live classes" text="On Google Meet or Zoom, cameras on. Ask me anything, any time." art={<LiveArt />} />
          <Card zoom={0.6} title="Every class recorded" text="Missed a class? Watch it the same night." art={<RecordedArt />} />
          <Card zoom={0.6} title="Weekly tests, marked by me" text="You see exactly where you lost marks." art={<TestArt />} />
          <Card zoom={0.6} title="Your own student portal" text="Your notes, tests and marks in one place." art={<PortalArt />} />
          <Card zoom={0.6} title="Answers that get marks" text="I show you how examiners mark, step by step." art={<MarksArt />} />
        </div>
      </div>
    </section>
  );
}
