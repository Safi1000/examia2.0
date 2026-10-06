"use client";

import { useRef } from "react";
import Image from "next/image";

export type Shot = { src: string; name: string; meta: string; alt: string };

/**
 * The wall of WhatsApp screenshots, as a swipeable rail.
 *
 * Scroll-snap does the work — no carousel library, no autoplay, no timers. The
 * arrows just nudge the same scroller, so a phone swipe and a desktop click end
 * up in exactly the same place. Each shot opens full size in a new tab, which is
 * the lightbox the browser already ships.
 */
export function ReviewSlider({ shots }: { shots: Shot[] }) {
  const railRef = useRef<HTMLUListElement>(null);

  function nudge(dir: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    // One card plus its gap, so a tap always lands on a card edge.
    const card = rail.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 20 : rail.clientWidth * 0.8;
    rail.scrollBy({ left: dir * step, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <ul
        ref={railRef}
        className="scrollbar-none flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shots.map((s) => (
          <li
            key={s.src}
            className="w-[82vw] max-w-[360px] shrink-0 snap-center sm:w-[340px]"
          >
            <figure className="overflow-hidden rounded-[20px] border border-hairline bg-card">
              <a
                href={s.src}
                target="_blank"
                rel="noopener noreferrer"
                className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                aria-label={`Open ${s.name}'s message full size`}
              >
                <div className="relative aspect-[9/14] w-full overflow-hidden bg-band-c">
                  <Image
                    src={s.src}
                    alt={s.alt}
                    fill
                    sizes="(max-width: 640px) 82vw, 340px"
                    className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  {/* Fade at the foot so a cut-off message reads as "there's more". */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(15,17,19,0.95)] to-transparent"
                  />
                  <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-gold-border bg-[rgba(20,22,24,0.75)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold backdrop-blur">
                    Tap to read
                  </span>
                </div>
              </a>
              <figcaption className="flex items-center justify-between border-t border-hairline px-4 py-3">
                <span className="text-sm font-semibold text-foreground">{s.name}</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-faint">{s.meta}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      {/* Arrows are an extra, not the only way through: the rail swipes and
          scrolls on its own, so they stay off touch screens. */}
      <div className="mt-4 hidden justify-center gap-2 sm:flex">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Previous message"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline-strong text-muted-foreground transition-colors hover:border-gold-border hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Next message"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline-strong text-muted-foreground transition-colors hover:border-gold-border hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          ›
        </button>
      </div>
    </div>
  );
}
