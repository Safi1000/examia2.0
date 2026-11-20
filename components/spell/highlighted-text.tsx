"use client";

/**
 * Highlighted Text, from Spell UI (spell.sh/docs/highlighted-text), adapted
 * for the brand: a gold band slides in behind one word, once, with the word in
 * the dark ink used on gold buttons (Spell's black-and-white blend mode would
 * turn the gold blue). Started by the page's own reveal (useRevealPlay); shown
 * finished on the server, with reduced motion, and on the first screen.
 * The moving part lives in ./motion-parts.tsx and loads only when needed.
 */
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { useRevealPlay } from "./useRevealPlay";

export type From = "left" | "right" | "top" | "bottom";

interface HighlightedTextProps {
  children: React.ReactNode;
  className?: string;
  from?: From;
  delay?: number;
}

export function HighlightedText({ children, className, from = "left", delay = 0.35 }: HighlightedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { phase, parts } = useRevealPlay(ref);
  const box = cn("relative inline-flex overflow-hidden rounded-[0.12em] align-baseline", className);

  if (phase === "still" || !parts) {
    return (
      <span ref={ref} className={box}>
        <span aria-hidden className="absolute inset-0 z-0 bg-gold" />
        <span className="relative z-10 px-[0.15em] text-band-b">{children}</span>
      </span>
    );
  }
  const { AnimatedBand } = parts;
  return (
    <span ref={ref} className={box}>
      <AnimatedBand from={from} delay={delay} play={phase === "play"}>
        {children}
      </AnimatedBand>
    </span>
  );
}
