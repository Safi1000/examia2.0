import Image from "next/image";
import type { ReactNode } from "react";

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
  zoom,
  className = "",
}: {
  label: string;
  title: string;
  text: string;
  art: ReactNode;
  /** How much the drawing shrinks on phones so it fills its panel. Desktop is always full size. */
  zoom: number;
  className?: string;
}) {
  return (
    <div
      data-spot
      className={`group flex flex-col overflow-hidden rounded-[16px] border border-hairline bg-card/80 backdrop-blur-sm transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-gold-border md:rounded-[22px] ${className}`}
    >
      <div aria-hidden className="relative flex items-center justify-center overflow-hidden bg-band-c/80 px-2 py-3 md:h-40 md:px-5 md:py-0">
        <div className="transition-transform duration-500 group-hover:scale-[1.04] max-md:[zoom:var(--z)]" style={{ ["--z" as string]: zoom }}>
          {art}
        </div>
      </div>
      <div className="p-3.5 md:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold md:text-[11px] md:tracking-[0.22em]">{label}</p>
        <h3 className="mt-1 text-sm font-bold leading-snug text-foreground md:mt-2 md:text-lg">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground md:mt-1.5 md:text-[15px]">{text}</p>
      </div>
    </div>
  );
}

function TeacherArt() {
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-gold shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
        <Image src="/hamza.jpg" alt="" fill sizes="80px" className="object-cover object-top" />
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <span className="rounded-full bg-gold px-3 py-1 text-[12px] font-bold text-[#1b1e21] shadow-[0_8px_20px_-8px_rgba(251,193,89,0.7)]">
          Straight A&apos;s
        </span>
        <span className="rounded-full border border-gold-border bg-gold-tint px-3 py-1 text-[11px] font-bold tracking-wide text-gold">
          ACCA
        </span>
        <span className="rounded-full border border-hairline-strong bg-card px-3 py-1 text-[11px] font-semibold text-body">
          BSc Applied Accountancy
        </span>
      </div>
    </div>
  );
}

const LEVELS = ["O Level", "IGCSE", "AS", "A2"];

function SyllabusArt() {
  return (
    <div className="w-full max-w-[250px] rounded-xl border border-hairline-strong bg-card p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between text-[10px] text-faint">
        <span className="font-semibold text-foreground">Your syllabus</span>
        <span>Cambridge · Edexcel</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {LEVELS.map((l, i) => (
          <span
            key={l}
            className={`rounded-md py-1 text-center text-[10px] font-semibold ${
              i === 2 ? "bg-gold text-[#1b1e21]" : "bg-card-raised text-muted-foreground"
            }`}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {[100, 100, 70].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
                w === 100 ? "bg-gold text-[#1b1e21]" : "border border-hairline-strong text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="h-1.5 flex-1 rounded bg-card-raised">
              <span className="block h-1.5 rounded bg-gold/70" style={{ width: `${w}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A small whiteboard: a supply and demand cross with a handwritten "why?". */
function WhyArt() {
  return (
    <div className="relative w-full max-w-[240px] rounded-xl border border-hairline-strong bg-[#17191b] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
      <svg viewBox="0 0 200 110" className="h-auto w-full" fill="none" strokeLinecap="round">
        <path d="M20 8 V96 H190" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        <path d="M40 90 L170 22" stroke="#FBC159" strokeWidth="2.5" />
        <path d="M40 22 L170 90" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" />
        <path d="M105 56 V96 M20 56 H105" stroke="rgba(251,193,89,0.6)" strokeWidth="1.2" strokeDasharray="3 4" />
        <circle cx="105" cy="56" r="4" fill="#FBC159" />
        <text x="174" y="20" fill="#FBC159" fontSize="10" fontWeight="700">S</text>
        <text x="174" y="94" fill="rgba(255,255,255,0.8)" fontSize="10" fontWeight="700">D</text>
        <text x="6" y="14" fill="rgba(255,255,255,0.5)" fontSize="9">P</text>
        <text x="182" y="106" fill="rgba(255,255,255,0.5)" fontSize="9">Q</text>
      </svg>
      <span className="absolute -right-2 -top-3 rotate-[-6deg] rounded-md bg-gold px-2 py-0.5 font-hand text-lg font-bold leading-tight text-[#1b1e21] shadow-lg">
        why?
      </span>
    </div>
  );
}

export function TrustBar() {
  return (
    <section aria-labelledby="why-title" className="py-8 md:py-12">
      <h2 id="why-title" className="sr-only">
        Why students choose Hamza Teaches for O Level and A Level Accounting, Business and Economics
      </h2>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-5 md:grid-cols-3 md:gap-5">
        <Card
          label="Your teacher"
          title="Straight A's in the subjects I teach"
          text="I sat these same exams. I teach every class myself, and only these three subjects."
          art={<TeacherArt />}
          zoom={0.56}
        />
        <Card
          label="What you learn"
          title="Your whole syllabus, topic by topic"
          text="O Level, IGCSE, AS and A Level, Cambridge or Edexcel, with past papers every week."
          art={<SyllabusArt />}
          zoom={0.6}
        />
        <Card
          label="How I teach"
          title="Why first, then the method"
          text="Every topic starts with why it exists, then the method, then real past-paper questions."
          art={<WhyArt />}
          zoom={0.8}
          className="col-span-2 md:col-span-1"
        />
      </div>
    </section>
  );
}
