"use client";

import { useEffect, useRef } from "react";

/**
 * One continuous background behind the whole public page, so sections blend
 * instead of sitting on separate bands:
 *  - a soft gold glow that follows the cursor (desktop, fine pointers only)
 *  - a large ambient gold glow that drifts left and right as you scroll down
 *  - a faint blueprint grid that shifts slightly against the cursor, and an
 *    edge vignette, for depth
 * Fixed and pointer-transparent. Both glows move only with the visitor's own
 * cursor or scroll (nothing animates on its own), so they stay on with
 * reduced motion too.
 */
export function Backdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    let frame = 0;
    let mx = window.innerWidth * 0.5;
    let my = window.innerHeight * 0.3;

    const paint = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      // Ambient glow sweeps side to side about three times down the page.
      el.style.setProperty("--ax", `${50 + Math.sin(p * Math.PI * 3) * 32}%`);
      el.style.setProperty("--ay", `${30 + Math.cos(p * Math.PI * 2) * 14}%`);
      el.style.setProperty("--mx", `${mx}px`);
      // The grid leans a few pixels away from the cursor: depth, no trail.
      el.style.setProperty("--gx", `${(mx / window.innerWidth - 0.5) * -16}px`);
      el.style.setProperty("--gy", `${(my / window.innerHeight - 0.5) * -12}px`);
      el.style.setProperty("--my", `${my}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      schedule();
      // Spotlight on the card under the cursor (see [data-spot] in globals.css).
      const card = (e.target as Element | null)?.closest?.("[data-spot]") as HTMLElement | null;
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--cx", `${e.clientX - r.left}px`);
        card.style.setProperty("--cy", `${e.clientY - r.top}px`);
      }
    };

    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    if (finePointer) {
      el.dataset.cursor = "on";
      window.addEventListener("pointermove", onMove, { passive: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="landing-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="landing-backdrop__ambient" />
      <div className="landing-backdrop__grid" />
      <div className="landing-backdrop__cursor" />
      <div className="landing-backdrop__vignette" />
    </div>
  );
}
