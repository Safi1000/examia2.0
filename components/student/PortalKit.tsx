"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { PortalArt } from "@/components/student/PortalArt";
import { Icon } from "@/components/ui/Icons";
import { buttonClasses } from "@/components/ui/Button";

/**
 * The small set of shapes every student page shares, so headers, section
 * titles, subject marks and grades look the same everywhere.
 */

/** Page title, an optional quiet line above it, and one line under it. */
export function PageHeader({
  title,
  eyebrow,
  children,
  aside,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-2", className)}>
      <div className="min-w-0">
        {/* One title block for every screen, student and teacher: the title, then one grey line.
            A page's old line above the title (eyebrow) now reads as that line when it has no other. */}
        <h1 className="text-balance text-title font-bold tracking-[-0.025em] text-ink sm:text-title-lg">{title}</h1>
        {(children || eyebrow) && <div className="mt-2 max-w-[60ch] text-base leading-relaxed text-pretty text-ink-2">{children || eyebrow}</div>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/**
 * A section title with an optional count, a grey line under it and a quiet
 * action on the right. Use it for every heading inside a page, so pages never
 * draw their own.
 *
 * Props: `children` (the words), `count?` (shown after the words when above 0),
 * `action?` (a quiet link on the right), `sub?` (one grey line under it),
 * `id?` (for aria-labelledby), `size?`: "page" (default, a section of the
 * page) or "card" (a smaller title inside a card).
 *
 * @example
 * <SectionTitle size="card" count={3} action={<Link href="/tests">All tests</Link>}>This week</SectionTitle>
 */
export function SectionTitle({
  children,
  count,
  action,
  sub,
  id,
  size = "page",
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  sub?: React.ReactNode;
  id?: string;
  size?: "page" | "card";
}) {
  return (
    // Flush with the page edge, like the page title above it and the cards below it.
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          className={cn(
            "flex items-center gap-2 font-bold text-ink",
            // "card" is the smaller title Progress and Plan used to draw by hand.
            size === "card" ? "text-lg tracking-[-0.01em]" : "text-xl leading-tight tracking-[-0.015em]",
          )}
        >
          {children}
          {typeof count === "number" && count > 0 && <span className="text-sm font-semibold text-ink-3 tabular-nums">{count}</span>}
          {/* After the words, so every section title starts on the same line. */}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
      </div>
      {action && <div className="shrink-0 text-sm">{action}</div>}
    </div>
  );
}

/*
 * Grades and milestones are drawn, never 3D: quiet line glyphs in a tile, and
 * grades as plain type in a fine ring, at every size. Gold only for A* and the
 * personal best. (The matte stone renders once used from 96px up were dropped:
 * Hamza, 17 Nov 2026.)
 */
/** From this size up the ring's line is a touch heavier. */
const STONE_MIN = 96;

/**
 * A line glyph (public/portal-art/glyphs, drawn in currentColor) in a soft
 * frosted tile with a hairline and an inner highlight. The glyph is painted
 * through a mask, so it takes the tile's text colour.
 */
export function GlyphTile({ name, size = 40, gold, className }: { name: string; size?: number; gold?: boolean; className?: string }) {
  const url = `url(/portal-art/glyphs/${name}.svg)`;
  const glyph = Math.round(size * 0.55);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: Math.max(8, Math.round(size * 0.28)) }}
      className={cn(
        "relative grid shrink-0 place-items-center bg-[linear-gradient(165deg,rgba(255,255,255,0.085),rgba(255,255,255,0.028)_55%,rgba(255,255,255,0.04))]",
        gold
          ? "text-brand shadow-[inset_0_0_0_1px_rgba(251,193,89,0.22),inset_0_1px_0_rgba(255,231,180,0.22),0_10px_26px_-12px_rgba(0,0,0,0.6)]"
          : "text-ink/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.075),inset_0_1px_0_rgba(255,255,255,0.16),0_10px_26px_-12px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <span
        style={{ width: glyph, height: glyph, WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }}
        className="block bg-current"
      />
    </span>
  );
}

/** A milestone (first-paper, streak-7, hours-25, personal-best): stone from 96px, else its glyph tile. */
export function MilestoneBadge({ name, size = 40, alt = "", className }: { name: string; size?: number; alt?: string; className?: string }) {
  const gold = name === "personal-best";
  const tile = <GlyphTile name={name} size={size} gold={gold} className={className} />;
  // Always the drawn tile. The 3D stone version was dropped (Hamza, 17 Nov 2026: not the look he wants).
  void alt;
  return tile;
}

/**
 * A grade as plain type in a fine ring (built in CSS), or the stone tablet
 * from 96px. A* is the only gold grade; U is quieter. The letter is always in
 * the text, so screen readers read it either way.
 */
export function GradeMedallion({ grade, size = 64, className }: { grade: string; size?: number; className?: string }) {
  const star = grade === "A*";
  const low = grade === "U";
  const ring = (
    <span
      role="img"
      aria-label={`Grade ${grade}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.41) }}
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-full bg-white/[0.035] font-semibold leading-none tracking-[-0.02em] tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        star
          ? "text-brand"
          : low
            ? "text-ink/55"
            : "text-ink",
        className,
      )}
    >
      {/* The ring: 1px under 96px, 1.25px above (an inset shadow, so it never shifts the layout). */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `inset 0 0 0 ${size >= STONE_MIN ? 1.25 : 1}px ${star ? "rgba(251,193,89,.75)" : low ? "rgba(240,237,232,.18)" : "rgba(240,237,232,.34)"}`,
        }}
      />
      {star && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{ inset: size <= 48 ? "9%" : "7%", boxShadow: `inset 0 0 0 ${size <= 48 ? 0.5 : 0.75}px rgba(251,193,89,${size <= 48 ? 0.35 : 0.32})` }}
        />
      )}
      <span aria-hidden>
        {star ? (
          <>
            A<sup className="ml-[0.02em] align-[0.55em] text-[0.55em] font-semibold">*</sup>
          </>
        ) : (
          grade
        )}
      </span>
    </span>
  );
  // Always the drawn ring, at every size. The 3D stone tablet was dropped (Hamza, 17 Nov 2026).
  return ring;
}

/**
 * An empty-state picture (portal-art/scenes, transparent, drawn for 160px),
 * or nothing until it exists. Below the fold, so it loads lazily.
 */
export function EmptyArt({ name, className }: { name: string; className?: string }) {
  return (
    <PortalArt
      group="scenes"
      name={name}
      width={160}
      height={160}
      className={cn("mx-auto mb-4 h-32 w-32 sm:h-36 sm:w-36", className)}
      imgClassName="object-contain"
    />
  );
}

/**
 * The small "all caught up" mark for a one-line done row: the picture when it
 * exists, else a quiet green tick.
 */
export function CaughtUpMark() {
  return (
    <PortalArt
      group="scenes"
      name="empty-all-caught-up"
      width={64}
      height={64}
      sized
      className="-my-2 shrink-0"
      imgClassName="object-contain"
      fallback={
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-success/25 bg-success-soft text-success">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      }
    />
  );
}

/* ------------------------------------------------------------------------
 * Progress, steps, endings and the way back. Progress is a ring or dots with
 * words, never a horizontal bar; chosen and done are off white, never gold.
 * ---------------------------------------------------------------------- */

/**
 * Progress as a ring: "2 of 19" chapters, tests, pages. Never rounds up: 0 is
 * an empty ring and the ring only closes when `done >= total`.
 *
 * Props: `done`, `total` (real counts only), `size?` (px, default 40),
 * `stroke?` (px, default 3), `label?` (centre text, for example "2/19"),
 * `tone?`: "plain" (off white, default) or "good" (green), `className?`.
 * Screen readers hear "2 of 19". Moves from the old value to the new one,
 * and stays still under reduced motion.
 *
 * @example
 * <ProgressRing done={2} total={19} label="2/19" />
 */
export function ProgressRing({
  done,
  total,
  size = 40,
  stroke = 3,
  label,
  tone = "plain",
  className,
}: {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  tone?: "plain" | "good";
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const full = total > 0 && done >= total;
  const frac = total > 0 ? Math.max(0, Math.min(done, total)) / total : 0;
  // Short of the total, always leave a visible gap, so 18 of 19 never looks done.
  const filled = full ? c : Math.min(frac * c, c - (stroke + 1.5));
  return (
    <span
      role="img"
      aria-label={`${Math.max(0, done)} of ${total}`}
      style={{ width: size, height: size }}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
    >
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(240,237,232,.12)" strokeWidth={stroke} />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone === "good" ? "var(--color-success)" : "var(--color-ink)"}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={c - filled}
            className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none"
          />
        )}
      </svg>
      {label != null && (
        <span aria-hidden className="relative font-semibold leading-none text-ink tabular-nums" style={{ fontSize: Math.max(9, Math.round(size * 0.26)) }}>
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * Where you are in a short set (12 or fewer): one 6px dot per step, done and
 * current off white, the rest faint. Too few for a ring, too many to read.
 *
 * Props: `at` (the current step, from 1), `total`, `words?` (adds "Step 2 of
 * 5" beside the dots), `className?`.
 *
 * @example
 * <StepDots at={2} total={5} words />
 */
export function StepDots({ at, total, words, className }: { at: number; total: number; words?: boolean; className?: string }) {
  const now = Math.max(0, Math.min(at, total));
  const text = `Step ${now} of ${total}`;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span role={words ? undefined : "img"} aria-label={words ? undefined : text} aria-hidden={words || undefined} className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-1.5 rounded-full transition-colors", i < now ? "bg-ink" : "bg-white/15")} />
        ))}
      </span>
      {words && <span className="text-sm text-ink-3 tabular-nums">{text}</span>}
    </div>
  );
}

/** One action for `FinishMoment`: a link when it has `href`, else a button. */
export type FinishAction = { label: React.ReactNode; href?: string; onClick?: () => void };

function FinishButton({ action, primary }: { action: FinishAction; primary?: boolean }) {
  const cls = buttonClasses({ variant: primary ? "primary" : "ghost", size: "lg", fullWidth: true });
  return action.href ? (
    <Link href={action.href} onClick={action.onClick} className={cls}>{action.label}</Link>
  ) : (
    <button type="button" onClick={action.onClick} className={cls}>{action.label}</button>
  );
}

/**
 * The ending of anything a student finishes: what happened, up to three real
 * numbers, exactly one gold next step and one quiet way out. No art.
 *
 * Props: `mark?` ("tick" for the green tick disc, or your own node; leave it
 * out when a score above is already the moment), `title`, `line?` (one grey
 * line), `facts?` (up to 3 `{ value, label }`, real numbers only), `primary`
 * (the one gold button), `secondary?` (a quiet button), `className?`.
 *
 * @example
 * <FinishMoment mark="tick" title="Done." line="Your answers are saved."
 *   facts={[{ value: "5/5", label: "Answered" }]}
 *   primary={{ label: "Next: Algebra foundations", href: "/test/t2" }}
 *   secondary={{ label: "Back to Study", href: "/study" }} />
 */
export function FinishMoment({ mark, title, line, facts, primary, secondary, className }: {
  mark?: "tick" | React.ReactNode;
  title: React.ReactNode;
  line?: React.ReactNode;
  facts?: { value: React.ReactNode; label: React.ReactNode }[];
  primary: FinishAction;
  secondary?: FinishAction;
  className?: string;
}) {
  const shown = (facts ?? []).slice(0, 3);
  return (
    <section className={cn("mx-auto max-w-md text-center", className)}>
      {mark === "tick" ? (
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-success/25 bg-success-soft text-success">
          <Icon.Check className="h-8 w-8" />
        </div>
      ) : mark ? <div className="mb-5 flex justify-center">{mark}</div> : null}
      <h2 className="text-balance text-title font-bold tracking-[-0.025em] text-ink">{title}</h2>
      {line && <p className="mt-2 text-base leading-relaxed text-pretty text-ink-2">{line}</p>}
      {shown.length > 0 && (
        <dl className="mt-6 flex justify-center gap-8">
          {shown.map((f, i) => (
            <div key={i} className="flex flex-col-reverse items-center gap-1">
              <dt className="text-xs text-ink-3">{f.label}</dt>
              <dd className="text-2xl font-bold leading-none text-ink tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-8 flex flex-col gap-2">
        <FinishButton action={primary} primary />
        {secondary && <FinishButton action={secondary} />}
      </div>
    </section>
  );
}

/**
 * A way back on phones in the browser, for pages opened from More (or Study).
 * Hidden from 768px up and inside the phone app, which draws its own back.
 *
 * Props: `href`, `label` (the page you go back to, for example "More").
 *
 * @example
 * <BackRow href="/more" label="More" />
 */
export function BackRow({ href, label }: { href: string; label: string }) {
  return (
    <div className="web-only md:hidden">
      <Link href={href} className="-ml-1.5 inline-flex h-11 items-center gap-1 pr-3 text-sm font-semibold text-ink-2 transition-colors hover:text-ink">
        <Icon.ChevronLeft className="h-4 w-4" />
        {label}
      </Link>
    </div>
  );
}
