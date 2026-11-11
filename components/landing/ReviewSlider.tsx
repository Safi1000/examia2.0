"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

export type Shot = { src: string; name: string; meta: string; alt: string };

/**
 * One sideways row of identical cards for phones (below 768px). At 768px and
 * wider the same list is laid out by `className` (a grid or wall), so tablets
 * and desktops look exactly as before.
 *
 * Native scroll snapping does the work: no dragging code, no autoplay, no
 * arrows. The row starts on the 20px page gutter and runs off the right edge
 * so the next card peeks in. Small dots under it follow the scroll position.
 */

const PHONE = "(max-width: 767.98px)";

function subscribePhone(cb: () => void) {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const isPhone = () => window.matchMedia(PHONE).matches;
const notPhone = () => false;

/** Card widths on phones. "card": one shows fully and the next peeks. "tile": two show and a third peeks. */
const WIDTH = {
  card: "max-md:[&>li]:w-[min(80vw,400px)]",
  tile: "max-md:[&>li]:w-[min(40vw,220px)]",
} as const;

/** Snap stops closer than this are one resting place (the last cards can't all reach the gutter). */
const MERGE_PX = 32;

export function SwipeRow({
  label,
  labelledBy,
  size = "card",
  className = "",
  children,
}: {
  /** Screen reader name for the row (or use `labelledBy`). */
  label?: string;
  labelledBy?: string;
  size?: keyof typeof WIDTH;
  /** Layout at 768px and wider. */
  className?: string;
  /** `SwipeItem`s, in reading order. */
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const phone = useSyncExternalStore(subscribePhone, isPhone, notPhone);
  const [pos, setPos] = useState({ count: 0, active: 0 });

  // Where the row can come to rest, and which of those it is nearest.
  const measure = useCallback(() => {
    const el = scroller.current;
    const list = el?.firstElementChild;
    if (!el || !list) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) {
      setPos((p) => (p.count === 0 ? p : { count: 0, active: 0 }));
      return;
    }
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    const left = el.getBoundingClientRect().left - el.scrollLeft;
    const stops: number[] = [];
    for (const item of Array.from(list.children)) {
      const at = Math.min(Math.max(item.getBoundingClientRect().left - left - pad, 0), max);
      const last = stops[stops.length - 1];
      if (last !== undefined && at - last < MERGE_PX) stops[stops.length - 1] = at;
      else stops.push(at);
    }
    let active = 0;
    stops.forEach((s, i) => {
      if (Math.abs(s - el.scrollLeft) < Math.abs(stops[active] - el.scrollLeft)) active = i;
    });
    setPos((p) => (p.count === stops.length && p.active === active ? p : { count: stops.length, active }));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !phone) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // Fires once on observe too, which gives the first measurement.
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [phone, measure]);

  return (
    <div>
      <div
        ref={scroller}
        role={phone ? "region" : undefined}
        aria-label={phone ? label : undefined}
        aria-labelledby={phone ? labelledBy : undefined}
        // Focusable only where it scrolls, so arrow keys can move it.
        tabIndex={phone ? 0 : undefined}
        className="swipe-row max-md:-mx-5 max-md:snap-x max-md:snap-mandatory max-md:scroll-pl-5 max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[-webkit-overflow-scrolling:touch] max-md:[touch-action:pan-x_pan-y] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
      >
        <ul
          className={`max-md:flex max-md:w-max max-md:gap-3 max-md:px-5 max-md:[&>li]:shrink-0 max-md:[&>li]:snap-start ${WIDTH[size]} ${className}`}
        >
          {children}
        </ul>
      </div>
      {pos.count > 1 && (
        <div
          role="img"
          aria-label={`Position ${pos.active + 1} of ${pos.count}`}
          className="mt-4 flex items-center justify-center gap-1.5 md:hidden"
        >
          {Array.from({ length: pos.count }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out motion-reduce:transition-none ${
                i === pos.active ? "w-4 bg-gold" : "w-1.5 bg-hairline-strong"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One card in a `SwipeRow`. Every card in a row stretches to the tallest. */
export function SwipeItem({ className = "", children }: { className?: string; children: ReactNode }) {
  return <li className={`flex flex-col ${className}`}>{children}</li>;
}
