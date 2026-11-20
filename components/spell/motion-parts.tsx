"use client";

/**
 * The moving parts of the three Spell UI pieces on the homepage (Words
 * Stagger, Highlighted Text, Signature), kept in one file so the motion
 * package is fetched only when a section below the first screen needs it
 * (see ./useRevealPlay.ts). Each piece starts hidden and plays once when
 * `play` turns true.
 */
import { forwardRef, useId } from "react";
import { motion, type Transition } from "motion/react";
import { cn } from "@/lib/cn";
import { FONT_SIZE, HEIGHT, PATHS, WIDTH } from "./signature-shape";
import type { From } from "./highlighted-text";

/* ---------- Words Stagger ---------- */
export const AnimatedWords = forwardRef<
  HTMLSpanElement,
  { text: string; className?: string; play: boolean; delay: number; stagger: number; speed: number }
>(function AnimatedWords({ text, className, play, delay, stagger, speed }, ref) {
  const words = text.split(" ").filter((word) => word.length > 0);
  const transition: Transition = { type: "tween", ease: [0.16, 1, 0.3, 1], duration: speed };
  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  const wordVariants = {
    hidden: { opacity: 0, y: 10, filter: "blur(10px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)", transition },
  };
  return (
    <motion.span ref={ref} className={cn("inline-flex flex-wrap", className)} variants={containerVariants} initial="hidden" animate={play ? "visible" : "hidden"}>
      <span className="sr-only">{text}</span>
      {words.map((word, index) => (
        <motion.span key={`${word}-${index}`} aria-hidden className="inline-block" variants={wordVariants}>
          {word}
          {index < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </motion.span>
      ))}
    </motion.span>
  );
});

/* ---------- Highlighted Text ---------- */
const fromVariants = {
  left: { hidden: { x: "-101%" }, visible: { x: "0%" } },
  right: { hidden: { x: "101%" }, visible: { x: "0%" } },
  top: { hidden: { y: "-101%" }, visible: { y: "0%" } },
  bottom: { hidden: { y: "101%" }, visible: { y: "0%" } },
};

export function AnimatedBand({ children, from, delay, play }: { children: React.ReactNode; from: From; delay: number; play: boolean }) {
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute inset-0 z-0 bg-gold"
        variants={fromVariants[from]}
        initial="hidden"
        animate={play ? "visible" : "hidden"}
        transition={{ type: "spring", damping: 30, stiffness: 300, delay }}
      />
      <motion.span
        className="relative z-10 px-[0.15em]"
        initial={{ color: "var(--color-ink)" }}
        animate={{ color: play ? "var(--color-band-b)" : "var(--color-ink)" }}
        transition={{ duration: 0.2, delay: delay + 0.12 }}
      >
        {children}
      </motion.span>
    </>
  );
}

/* ---------- Signature ---------- */
const PATH_DELAY_STEP = 0.2;
const PATH_VARIANTS = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1 },
};
function timing(index: number, duration: number, delay: number) {
  const at = delay + index * PATH_DELAY_STEP;
  return {
    pathLength: { delay: at, duration, ease: "easeInOut" as const },
    opacity: { delay: at + 0.01, duration: 0.01 },
  };
}

export const AnimatedSignature = forwardRef<
  SVGSVGElement,
  { label: string; color: string; duration: number; delay: number; className?: string; play: boolean }
>(function AnimatedSignature({ label, color, duration, delay, className, play }, ref) {
  const maskId = `signature-reveal-${useId().replace(/:/g, "")}`;
  const lines = (stroke: string, strokeWidth: number, cap: "round" | "butt") =>
    PATHS.map((d, i) => (
      <motion.path
        key={i}
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        variants={PATH_VARIANTS}
        transition={timing(i, duration, delay)}
        vectorEffect="non-scaling-stroke"
        strokeLinecap={cap}
        strokeLinejoin="round"
      />
    ));
  return (
    <motion.svg
      ref={ref}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      fill="none"
      className={className}
      role="img"
      aria-label={label}
      initial="hidden"
      animate={play ? "visible" : "hidden"}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          {lines("white", FONT_SIZE * 0.22, "round")}
        </mask>
      </defs>
      {lines(color, 2, "butt")}
      <g mask={`url(#${maskId})`}>
        {PATHS.map((d, i) => (
          <path key={i} d={d} fill={color} />
        ))}
      </g>
    </motion.svg>
  );
});
