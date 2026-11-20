"use client";

/**
 * Signature, from Spell UI (spell.sh/docs/signature), adapted: Hamza's name
 * writes itself in gold, once, when Meet Hamza scrolls into view.
 *
 * Spell's version downloads a font and a font reader in the visitor's browser
 * and traces the letters there. Here the letters were traced once, ahead of
 * time (./signature-shape.ts), so visitors only get these few shapes.
 *
 * Started by the page's own reveal (useRevealPlay); shown finished on the
 * server, with reduced motion, and when already on screen. The drawing part
 * lives in ./motion-parts.tsx and loads only when needed.
 */
import { useRef } from "react";
import { HEIGHT, PATHS, WIDTH } from "./signature-shape";
import { useRevealPlay } from "./useRevealPlay";

interface SignatureProps {
  /** Shown to screen readers; the drawing itself is decorative. */
  label?: string;
  color?: string;
  duration?: number;
  delay?: number;
  className?: string;
}

export function Signature({ label = "Hamza", color = "var(--color-gold)", duration = 1.1, delay = 0.2, className }: SignatureProps) {
  const ref = useRef<SVGSVGElement>(null);
  const { phase, parts } = useRevealPlay(ref);

  if (phase === "still" || !parts) {
    return (
      <svg ref={ref} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} fill="none" className={className} role="img" aria-label={label}>
        {PATHS.map((d, i) => (
          <path key={i} d={d} fill={color} />
        ))}
      </svg>
    );
  }
  const { AnimatedSignature } = parts;
  return <AnimatedSignature ref={ref} label={label} color={color} duration={duration} delay={delay} className={className} play={phase === "play"} />;
}
