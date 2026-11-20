"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * When a Spell UI animation on the public pages may play.
 *
 * "still": show the finished text, no animation. That is the server render
 * (so the words are there without JavaScript), reduced motion, anything
 * already on screen when the page opens (no flicker on the first screen), and
 * anything whose animation code arrived too late to start hidden.
 * "wait": hidden, ready to play. "play": play once.
 *
 * It follows the page's own scroll reveal (components/landing/Reveal.tsx):
 * it plays when its [data-reveal] block is marked `.is-in`. Motion's own
 * "when visible" check is not used, because it can stay silent in a
 * background or embedded tab and leave a heading hidden; Reveal has a
 * timer guard so every block is marked in the end.
 *
 * Speed: the animation code (the motion package, about 48 KB) is not part of
 * the first download. It is fetched here, only for a block below the first
 * screen, and only once (./motion-parts.tsx).
 */
export type RevealPlay = "still" | "wait" | "play";
type Parts = typeof import("./motion-parts");

let partsPromise: Promise<Parts> | null = null;
const loadParts = () => (partsPromise ??= import("./motion-parts"));

export function useRevealPlay(ref: RefObject<HTMLElement | SVGElement | null>): { phase: RevealPlay; parts: Parts | null } {
  const [phase, setPhase] = useState<RevealPlay>("still");
  const [parts, setParts] = useState<Parts | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const block = el.closest<HTMLElement>("[data-reveal]");
    // Without a reveal block there is nothing to wait for: keep it still.
    if (!block) return;
    const r = block.getBoundingClientRect();
    const onScreen = r.top < window.innerHeight && r.bottom > 0;
    if (onScreen || block.classList.contains("is-in")) return;
    let alive = true;
    let watch: MutationObserver | null = null;
    let settle = 0;
    loadParts()
      .then((m) => {
        // Arrived after the block came into view: it stays still rather than vanish and replay.
        if (!alive || block.classList.contains("is-in")) return;
        setParts(m);
        setPhase("wait");
        watch = new MutationObserver(() => {
          if (block.classList.contains("is-in")) {
            setPhase("play");
            watch?.disconnect();
            // Safety net: whatever happens to the animation (a paused tab, a
            // slow phone), the finished text is on screen 4 seconds later.
            settle = window.setTimeout(() => alive && setParts(null), 4000);
          }
        });
        watch.observe(block, { attributes: true, attributeFilter: ["class"] });
      })
      .catch(() => {
        // Not loaded (offline): the text simply stays as it is.
      });
    return () => {
      alive = false;
      watch?.disconnect();
      window.clearTimeout(settle);
    };
  }, [ref]);
  return { phase: parts ? phase : "still", parts };
}
