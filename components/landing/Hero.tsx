"use client";

import { VideoPlayer } from "./VideoPlayer";
import { useBooking } from "./BookingModal";
import { Magnetic } from "./Magnetic";
import { LANDING, posterFor, track } from "@/lib/landing";
import { COMPANY_NAME } from "@/lib/config";

/**
 * Above the fold: the trial pill, the headline, the tagline and one button.
 * Who and what (subjects, boards, online) is in the trust cards just below.
 */
export function Hero() {
  const { open } = useBooking();

  return (
    <section id="top">
      <div className="intro-rise mx-auto flex max-w-4xl flex-col items-center px-5 pb-14 pt-10 text-center md:pb-20 md:pt-16">
        <Magnetic strength={0.15}>
          <button
            type="button"
            onClick={() => open({ from: "hero_pill" })}
            className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-hairline-strong bg-[rgba(33,36,39,0.5)] px-4 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-gold-border hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
            <span className="hidden sm:inline">Live online · </span>Free trials open for May / June 2027
            <span aria-hidden className="text-gold transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        </Magnetic>

        <h1 className="mt-7 text-[2.6rem] font-bold leading-[1.04] tracking-[-0.03em] text-foreground sm:text-6xl md:text-[4.25rem]">
          <span className="block">You know the syllabus.</span>
          <span className="block text-[#c3c8cd]">You still lose the marks.</span>
        </h1>

        <p className="mt-6 whitespace-nowrap font-hand text-[clamp(1.5rem,4.6vw,2.4rem)] font-bold text-gold">
          Start from scratch. Finish{" "}
          <span className="relative inline-block">
            exam ready.
            <svg aria-hidden className="absolute -bottom-2 left-0 w-full" viewBox="0 0 220 16" fill="none" preserveAspectRatio="none">
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

        <p className="mt-7 flex items-center justify-center gap-3 text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:gap-4 sm:text-sm">
          <span>Accounting</span>
          <span aria-hidden className="h-3.5 w-px bg-gold/60" />
          <span>Business</span>
          <span aria-hidden className="h-3.5 w-px bg-gold/60" />
          <span>Economics</span>
        </p>

        <Magnetic strength={0.4} className="mt-8">
          <button
            type="button"
            onClick={() => open({ from: "hero" })}
            className="btn-shine group inline-flex min-h-14 items-center gap-2 rounded-full bg-gold px-8 text-base font-semibold text-[#1b1e21] shadow-[0_12px_40px_-12px_rgba(251,193,89,0.55)] transition-[background-color,transform] hover:bg-[#ffd07a] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Book your free trial lesson
            <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        </Magnetic>
      </div>

      <div className="mx-auto max-w-5xl px-5 pb-12 md:pb-20">
        <div
          onClick={() => track("vsl_play")}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const el = e.currentTarget;
            const r = el.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            el.style.transition = "transform 0.2s ease-out";
            el.style.transform = `perspective(1400px) rotateX(${-py * 4}deg) rotateY(${px * 5}deg)`;
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.transition = "transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)";
            e.currentTarget.style.transform = "";
          }}
          className="relative aspect-video w-full overflow-hidden rounded-[28px] border border-hairline-strong bg-band-c shadow-[0_40px_120px_-40px_rgba(251,193,89,0.25)]"
        >
          <VideoPlayer
            big
            src={LANDING.heroVideo}
            poster={LANDING.heroPoster || posterFor(LANDING.heroVideo)}
            title={`${COMPANY_NAME}: introduction video`}
          />
        </div>
      </div>
    </section>
  );
}
