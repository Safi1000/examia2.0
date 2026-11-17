import type { CSSProperties, ReactNode } from "react";

/**
 * The home page's drawings share one small kit, so every picture reads as
 * the same hand: a lit stage, and on it a few finely made "plates" (pieces of
 * the real class and portal), layered for depth, with gold kept to one jewel
 * per picture. Flat and drawn, never 3D or photographic.
 */

/** The lit stage behind a drawing: a soft light from above, a faint dotted floor, a darker foot. */
export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={`relative isolate flex items-center justify-center overflow-hidden border-b border-hairline bg-band-c ${className}`}>
      <span className="absolute inset-0 -z-10 bg-[radial-gradient(110%_85%_at_50%_-10%,rgba(255,255,255,0.085),transparent_62%)]" />
      <span className="absolute inset-0 -z-10 [background-image:radial-gradient(rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(75%_75%_at_50%_45%,#000,transparent)]" />
      <span className="absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t from-black/30 to-transparent" />
      {children}
    </div>
  );
}

/** One finely made surface: a soft top light, a hairline edge and a grounded shadow. */
export const plate =
  "rounded-[14px] border border-white/[0.09] bg-[linear-gradient(180deg,#2d3135,#222528)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_0_rgba(0,0,0,0.55),0_24px_30px_-22px_rgba(0,0,0,0.95)]";

/** A dimmer plate peeking out behind the main one, for depth. */
export function BackPlate({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span style={style} className={`absolute rounded-[14px] border border-white/[0.06] bg-[#1f2225] ${className}`} />;
}

/** A small gold tick in a ring, drawn (not a typed symbol). */
/** `--d` for a va-* part: how long after its block arrives it plays. */
export const after = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Tick({ on = true, size = 16, d }: { on?: boolean; size?: number; d?: number }) {
  return (
    <span
      style={{ width: size, height: size, ...(d !== undefined ? after(d) : null) }}
      className={`flex shrink-0 items-center justify-center rounded-full ${d !== undefined && on ? "va-pop " : ""}${on ? "bg-gold text-band-b shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]" : "border border-white/[0.18]"}`}
    >
      {on && (
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.4l2.4 2.4 4.6-5.4" />
        </svg>
      )}
    </span>
  );
}

/** A quiet chip for a small fact inside a drawing. */
export function Chip({ children, gold = false }: { children: ReactNode; gold?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-semibold leading-none ${
        gold ? "border border-gold-border bg-gold-tint text-gold" : "border border-white/[0.09] bg-white/[0.04] text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

/** My handwriting, wherever the pen shows up in a drawing. */
export const hand = "font-hand font-bold leading-none";

/**
 * A seat in the class, drawn as a ticket: what the free trial actually is.
 * The two notches are cut out of the card, so the page shows through them.
 */
export function SeatTicket({ logo }: { logo: ReactNode }) {
  const notches =
    "radial-gradient(circle 9px at 74% 0, transparent 96%, #000 100%), radial-gradient(circle 9px at 74% 100%, transparent 96%, #000 100%)";
  return (
    <div aria-hidden className="mx-auto w-full max-w-[380px] -rotate-2 [filter:drop-shadow(0_26px_24px_rgba(0,0,0,0.55))]">
      <div
        style={{ WebkitMaskImage: notches, maskImage: notches, WebkitMaskComposite: "source-in", maskComposite: "intersect" }}
        className="relative flex overflow-hidden rounded-[16px] border border-gold/35 bg-[linear-gradient(180deg,#2e3236,#212427)] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]"
      >
        {/* a fine gold line inside the edge, like foil */}
        <span className="pointer-events-none absolute inset-[5px] rounded-[11px] border border-gold/15" />
        <div className="min-w-0 flex-[0_0_74%] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="h-3.5 opacity-90">{logo}</span>
            <span className="text-[10px] font-semibold text-faint">Free trial lesson</span>
          </div>
          <p className="mt-3 text-[26px] font-extrabold leading-none tracking-[-0.035em] text-foreground">Admit one</p>
          <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">A seat in a real class, live, with me.</p>
          <div className="mt-3 flex items-center gap-1.5">
            <Chip>Accounting</Chip>
            <Chip>Business</Chip>
            <Chip>Economics</Chip>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 border-l border-dashed border-white/[0.18] px-3 py-4">
          <Tick size={30} d={550} />
          <span className="text-[11px] font-semibold text-gold">Free</span>
        </div>
      </div>
    </div>
  );
}
