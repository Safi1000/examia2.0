import Image from "next/image";
import { SwipeItem, SwipeRow } from "./ReviewSlider";
import type { ReactNode } from "react";
import { BackPlate, Stage, Tick, after, hand, plate } from "./Vignette";

/**
 * The three cards under the hero: who teaches, what is covered, how it is
 * taught. Each has a small drawing in the same style as "Inside my classes",
 * instead of a generic icon.
 */

function Card({
  label,
  title,
  text,
  art,
}: {
  label: string;
  title: string;
  text: string;
  art: ReactNode;
}) {
  // Phones: one row of identical cards (same picture shape, title room for two
  // lines), so label, title and text start at the same height in every card.
  return (
    <div data-reveal className="pc-surface flex flex-1 flex-col overflow-hidden rounded-card">
      <Stage className="px-4 max-md:h-[216px] md:h-52 md:px-5">
        <div className="flex w-full justify-center">{art}</div>
      </Stage>
      <div className="p-5 md:p-6">
        <p className="text-sm font-semibold text-faint">{label}</p>
        <h3 className="mt-2 text-lg leading-snug max-md:min-h-[2lh]">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground md:mt-1.5">{text}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 1. your teacher
   My photo in a fine gold bezel, and what I bring, as a short list. */
const CREDENTIALS = ["Straight As", "ACCA", "BSc Applied Accountancy"];

function TeacherArt() {
  return (
    <div className="flex items-center gap-3.5">
      <span className="relative flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_210deg,#FBC159,rgba(251,193,89,0.18)_38%,#FBC159_72%,rgba(251,193,89,0.35))] shadow-[0_22px_28px_-18px_rgba(0,0,0,0.95)]">
        <span className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-band-c">
          <span className="relative h-[72px] w-[72px] overflow-hidden rounded-full">
            <Image src="/hamza.jpg" alt="" fill sizes="72px" className="object-cover object-top" />
          </span>
        </span>
      </span>
      <div className={`divide-y divide-white/[0.06] whitespace-nowrap ${plate}`}>
        {CREDENTIALS.map((c, i) => (
          <p key={c} className="flex items-center gap-2.5 whitespace-nowrap! px-3.5 py-[7px] text-[11px] font-semibold leading-tight text-body">
            <Tick size={14} d={350 + i * 170} />
            {c}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 2. your syllabus
   The level switch and a few real topics, ticked off as we cover them. */
const LEVELS = ["O Level", "IGCSE", "AS", "A2"];
const COVERED = [
  { t: "Double entry", done: true },
  { t: "Depreciation", done: true },
  { t: "Bank reconciliation", done: false },
];

function SyllabusArt() {
  return (
    <div className="relative w-full max-w-[262px]">
      <BackPlate className="inset-x-4 -top-2 bottom-5" />
      <div className={`relative overflow-hidden ${plate}`}>
        <div className="flex items-center justify-between px-3.5 pt-2.5 text-[10px] text-faint">
          <span className="text-[11px] font-semibold text-foreground">Your syllabus</span>
          <span>Cambridge · Edexcel</span>
        </div>
        <div className="mx-3.5 mt-2 grid grid-cols-4 rounded-full border border-white/[0.07] bg-black/20 p-[2px]">
          {LEVELS.map((l, i) => (
            <span
              key={l}
              className={`rounded-full py-[5px] text-center text-[10px] font-semibold leading-none ${
                i === 2 ? "bg-white/[0.12] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" : "text-faint"
              }`}
            >
              {l}
            </span>
          ))}
        </div>
        <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.07]">
          {COVERED.map((x, i) => (
            <p key={x.t} className="flex items-center gap-2.5 px-3.5 py-[6px] text-[11px]">
              <Tick on={x.done} size={14} d={350 + i * 170} />
              <span className={x.done ? "text-body" : "text-foreground"}>{x.t}</span>
              <span className="ml-auto text-[10px] text-faint">{x.done ? "Covered" : "This week"}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 3. why first
   My board: demand and supply, supply moving out, and the question I always
   ask before the method. */
function WhyArt() {
  const ink = "rgba(240,237,232,0.82)";
  const faint = "rgba(240,237,232,0.38)";
  const caveat = { fontFamily: "var(--font-caveat), cursive", fontWeight: 700 } as const;
  return (
    <div className="relative mt-3 w-full max-w-[262px]">
      <BackPlate className="inset-x-4 -top-2 bottom-5" />
      <div className={`relative px-3.5 pb-2.5 pt-3 ${plate}`}>
        <svg viewBox="0 0 236 122" className="h-auto w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {/* axes, with arrow heads */}
          <path d="M26 10 V104 H216" stroke={faint} strokeWidth="1.4" />
          <path d="M22.5 15 L26 9 L29.5 15 M211 100.5 L217 104 L211 107.5" stroke={faint} strokeWidth="1.4" />
          {/* demand */}
          <path d="M46 24 C 82 52, 128 80, 178 96" stroke={ink} strokeWidth="2.2" />
          {/* supply, then supply moved out */}
          <path d="M46 96 C 86 78, 120 52, 150 22" stroke={faint} strokeWidth="2" strokeDasharray="1 6" />
          <path d="M78 98 C 118 80, 152 54, 182 24" stroke="#FBC159" strokeWidth="2.4" pathLength={1} className="va-draw" style={after(500)} />
          {/* the move */}
          <path d="M122 44 H148 M143 40 L149 44 L143 48" stroke="rgba(251,193,89,0.75)" strokeWidth="1.4" />
          {/* old and new price, read off the axis */}
          <path d="M26 61 H104 M26 77 H132 M132 77 V104" stroke="rgba(251,193,89,0.45)" strokeWidth="1" strokeDasharray="2 4" />
          <circle cx="104" cy="61" r="3" fill="#232629" stroke={ink} strokeWidth="1.5" />
          <circle cx="132" cy="77" r="4.2" fill="#FBC159" />
          <circle cx="132" cy="77" r="7.5" stroke="rgba(251,193,89,0.35)" strokeWidth="1" />
          {/* labels, in my hand */}
          <text x="10" y="20" fill={faint} fontSize="14" style={caveat}>P</text>
          <text x="206" y="119" fill={faint} fontSize="14" style={caveat}>Q</text>
          <text x="182" y="100" fill={ink} fontSize="15" style={caveat}>D</text>
          <text x="152" y="20" fill={faint} fontSize="14" style={caveat}>S</text>
          <text x="186" y="21" fill="#FBC159" fontSize="15" style={caveat}>S₁</text>
          <text x="9" y="65" fill={faint} fontSize="12" style={caveat}>P</text>
          <text x="6" y="81" fill="#FBC159" fontSize="12" style={caveat}>P₁</text>
        </svg>
        {/* the question, circled */}
        <span className="va-pop absolute -right-2.5 -top-4 rotate-[5deg]" style={after(1200)}>
          <span className={`${hand} relative block px-3 py-1.5 text-[19px] text-gold`}>
            why?
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 64 34" fill="none" preserveAspectRatio="none">
              <path d="M8 19 C 6 8, 24 3, 38 4 C 54 5, 61 12, 58 20 C 55 29, 34 32, 20 29 C 10 27, 5 23, 9 14" stroke="rgba(251,193,89,0.8)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
        </span>
      </div>
    </div>
  );
}

export function TrustBar() {
  return (
    <section aria-labelledby="why-title" className="py-6 md:py-10">
      <h2 id="why-title" className="sr-only">
        Why students choose Hamza Teaches for O Level and A Level Accounting, Business and Economics
      </h2>
      <div className="mx-auto max-w-6xl px-5">
        <SwipeRow labelledBy="why-title" className="md:grid md:grid-cols-3 md:gap-5">
          <SwipeItem>
            <Card
              label="Your teacher"
              title="Straight As in the subjects I teach"
              text="I sat these same exams. I teach every class myself, and only these three subjects."
              art={<TeacherArt />}
            />
          </SwipeItem>
          <SwipeItem>
            <Card
              label="What you learn"
              title="Your whole syllabus, topic by topic"
              text="O Level, IGCSE, AS and A Level, Cambridge or Edexcel, with past papers every week."
              art={<SyllabusArt />}
            />
          </SwipeItem>
          <SwipeItem>
            <Card
              label="How I teach"
              title="Why first, then the method"
              text="Every topic starts with why it exists, then the method, then real past paper questions."
              art={<WhyArt />}
            />
          </SwipeItem>
        </SwipeRow>
      </div>
    </section>
  );
}
