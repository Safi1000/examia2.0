"use client";

import { cn } from "@/lib/cn";
import { ArtImage, PortalArt, type ArtEntry } from "@/components/student/PortalArt";

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
        {eyebrow && <p className="label-quiet mb-3 text-ink-3">{eyebrow}</p>}
        <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[2.5rem]">{title}</h1>
        {children && <div className="mt-3 max-w-[60ch] text-base leading-relaxed text-pretty text-ink-2">{children}</div>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/** A section title with an optional count and a quiet action on the right. */
export function SectionTitle({
  children,
  count,
  action,
  sub,
  id,
  live,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  sub?: React.ReactNode;
  id?: string;
  /** A slow gold dot: something here wants doing now. */
  live?: boolean;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em] text-ink">
          {live && <span aria-hidden className="h-1.5 w-1.5 animate-low-pulse rounded-full bg-brand" />}
          {children}
          {typeof count === "number" && count > 0 && <span className="text-sm font-semibold text-ink-3 tabular-nums">{count}</span>}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
      </div>
      {action && <div className="shrink-0 text-sm">{action}</div>}
    </div>
  );
}

/*
 * Portal art v2 (public/portal-art/v2.json), used with restraint: only where it
 * means something (a result's grade, the personal best, milestones). Subjects are
 * shown by name only. Matte stone objects from 96px up, quiet line glyphs in a
 * frosted tile below that, and grades as plain type in a fine ring. Gold only
 * for A* and the personal best.
 */
const STONE_MIN = 96;
type StoneSet = "subjects" | "grades" | "badges";
const stoneEntry = (set: StoneSet, key: string): ArtEntry => ({
  key,
  src: `/portal-art/stone/${set}/${key}.webp`,
  src2x: `/portal-art/stone/${set}/${key}@2x.webp`,
  width: 160,
  height: 160,
});

/** A stone object at its showcase size, or the fallback if the file is missing. */
function Stone({ set, name, size, alt = "", fallback, className }: { set: StoneSet; name: string; size: number; alt?: string; fallback: React.ReactNode; className?: string }) {
  return (
    <ArtImage
      key={`${set}/${name}`}
      entry={stoneEntry(set, name)}
      fallback={fallback}
      alt={alt}
      width={size}
      height={size}
      sized
      className={cn("shrink-0", className)}
      imgClassName="object-contain"
    />
  );
}

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
  if (size < STONE_MIN) return tile;
  return <Stone set={gold ? "grades" : "badges"} name={name} size={size} alt={alt} fallback={tile} className={className} />;
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
        "relative inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none tracking-[-0.02em] tabular-nums",
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
  if (size < STONE_MIN) return ring;
  return (
    <Stone
      set="grades"
      name={star ? "a-star" : grade.toLowerCase()}
      size={size}
      alt={`Grade ${grade}`}
      fallback={ring}
      className={cn("drop-shadow-[0_10px_18px_rgba(0,0,0,0.4)]", className)}
    />
  );
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
