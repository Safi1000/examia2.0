"use client";

import { useEffect, useRef, useState } from "react";
import { PillButton } from "./PillButton";
import { VideoPlayer } from "./VideoPlayer";
import { LANDING, track } from "@/lib/landing";
import { COMPANY_NAME } from "@/lib/config";

const activityCards = [
  { title: "Trial requested", sub: "AS · Economics", pos: "left-[3%] top-[14%] rotate-[-4deg]", speed: 0.06, delay: "0.35s" },
  { title: "Notes shared", sub: "Depreciation, O Level", pos: "right-[2%] top-[30%] rotate-[3deg]", speed: 0.1, delay: "0.55s" },
  { title: "Lesson booked", sub: "A2 · Business", pos: "left-[4%] top-[54%] rotate-[2.5deg]", speed: 0.045, delay: "0.8s" },
];

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onMouseMove = (e: React.MouseEvent) => {
    if (!glowRef.current || !heroRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    glowRef.current.style.background = `radial-gradient(560px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, rgba(251,193,89,0.07), transparent 60%)`;
  };

  const scrollToPicker = () =>
    document.getElementById("picker")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section
      id="top"
      ref={heroRef}
      onMouseMove={onMouseMove}
      className="relative overflow-hidden bg-band-a pt-[64px]"
    >
      <div ref={glowRef} aria-hidden className="pointer-events-none absolute inset-0" />

      {/* Editorial corner marks, desktop */}
      <span aria-hidden className="pointer-events-none absolute left-4 top-4 hidden h-4 w-4 border-l border-t border-hairline-strong min-[1100px]:block" />
      <span aria-hidden className="pointer-events-none absolute right-4 top-4 hidden h-4 w-4 border-r border-t border-hairline-strong min-[1100px]:block" />

      {activityCards.map((c) => (
        <div
          key={c.title}
          aria-hidden
          className={`float-in absolute z-10 hidden w-56 rounded-[20px] border border-hairline bg-card p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] min-[1280px]:block ${c.pos}`}
          style={{ animationDelay: c.delay, translate: `0 ${-scrollY * c.speed}px` }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-tint text-gold">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 8l3 3 7-8" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
              <p className="truncate text-xs text-faint">{c.sub}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2 w-full rounded-full bg-card-raised" />
            <div className="h-2 w-2/3 rounded-full bg-card-raised" />
          </div>
        </div>
      ))}

      {/* Text stack, locked to 58svh minus top pad */}
      <div
        className="relative z-20 mx-auto flex max-w-4xl flex-col items-center justify-center px-5 text-center"
        style={{ minHeight: "calc(58svh - 64px)" }}
      >
        <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-faint">
          <span aria-hidden className="h-px w-8 bg-gold" />
          Accounting · Business · Economics
          <span aria-hidden className="h-px w-8 bg-gold" />
        </p>

        <h1 className="mx-auto mt-6 max-w-[16ch] text-4xl leading-[1.05] text-foreground sm:text-5xl md:text-6xl">
          You have read it four times. It still does not make sense.
        </h1>

        <p className="mt-5 whitespace-nowrap font-hand text-[clamp(1.4rem,4.6vw,2.4rem)] font-bold text-gold">
          Start from scratch. Finish{" "}
          <span className="relative inline-block">
            exam ready.
            <svg
              aria-hidden
              className="absolute -bottom-2 left-0 w-full"
              viewBox="0 0 220 16"
              fill="none"
              preserveAspectRatio="none"
            >
              <path
                d="M5 10 C 40 4, 75 14, 112 8 C 150 2, 180 12, 215 7"
                stroke="#FBC159"
                strokeWidth="8"
                strokeLinecap="round"
                pathLength="1"
                className="draw-underline"
              />
            </svg>
          </span>
        </p>

        <div className="mt-9">
          <PillButton magnetic onClick={scrollToPicker}>
            <span>Watch a free lesson</span>
            <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </PillButton>
        </div>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-faint">
          Free. Nothing to pay.
        </p>
      </div>

      {/* Video, cut in half by fold */}
      <div className="relative z-10 mx-auto max-w-4xl px-5 pb-[120px] pt-8">
        <div
          onClick={() => track("vsl_play")}
          className="relative aspect-video w-full overflow-hidden rounded-[28px] border border-hairline bg-band-c shadow-[0_0_120px_rgba(251,193,89,0.12)]"
        >
          <VideoPlayer
            big
            src={LANDING.heroVideo}
            poster={LANDING.heroPoster || undefined}
            title={`${COMPANY_NAME} — watch a free lesson`}
          />
          <span className="pointer-events-none absolute right-4 top-4 rounded-full border border-gold-border px-3 py-1 text-xs font-semibold text-gold">
            Your video
          </span>
          <span className="pointer-events-none absolute bottom-4 left-5 text-[10px] uppercase tracking-[0.2em] text-faint">
            2 min
          </span>
        </div>
      </div>
    </section>
  );
}
