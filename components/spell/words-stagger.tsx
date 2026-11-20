"use client";

/**
 * Words Stagger, from Spell UI (spell.sh/docs/words-stagger), adapted for the
 * public pages: each word eases up out of a soft blur, once, when its section
 * scrolls into view. Started by the page's own reveal (useRevealPlay), and
 * shown still on the server, with reduced motion, and on the first screen.
 * The moving part lives in ./motion-parts.tsx and loads only when needed.
 */
import React, { useRef } from "react";
import { useRevealPlay } from "./useRevealPlay";

interface WordsStaggerProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  speed?: number;
}

export function WordsStagger({ children, className, delay = 0.1, stagger = 0.08, speed = 0.5 }: WordsStaggerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { phase, parts } = useRevealPlay(ref);
  const text = React.Children.toArray(children)
    .filter((child) => typeof child === "string")
    .join("");

  if (phase === "still" || !parts) {
    return (
      <span ref={ref} className={className}>
        {text}
      </span>
    );
  }
  const { AnimatedWords } = parts;
  return <AnimatedWords ref={ref} text={text} className={className} play={phase === "play"} delay={delay} stagger={stagger} speed={speed} />;
}
