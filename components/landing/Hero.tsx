"use client";

import { VideoPlayer } from "./VideoPlayer";
import { useBooking } from "./BookingModal";
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
        <button
          type="button"
          onClick={() => open({ from: "hero_pill" })}
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline-strong bg-[rgba(33,36,39,0.5)] px-4 text-sm text-muted-foreground transition-colors duration-200 hover:border-[rgba(255,255,255,0.28)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <span className="hidden sm:inline">Live online · </span>Free trials open for May / June 2027
          <span aria-hidden className="text-faint transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
        </button>

        <h1 className="mt-7 text-[2.5rem] leading-[1.06] sm:text-6xl md:text-[4.25rem]">
          <span className="block">You know the syllabus.</span>
          <span className="block text-[#b9bec3]">You still lose the marks.</span>
        </h1>

        <p className="mt-6 whitespace-nowrap max-[359px]:whitespace-normal font-hand text-[clamp(1.5rem,4.6vw,2.4rem)] font-bold text-gold">
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

        <p className="mt-7 flex items-center justify-center gap-3 text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:gap-4 sm:text-sm">
          <span>Accounting</span>
          <span aria-hidden className="h-3.5 w-px bg-hairline-strong" />
          <span>Business</span>
          <span aria-hidden className="h-3.5 w-px bg-hairline-strong" />
          <span>Economics</span>
        </p>

        <button
          type="button"
          data-hero-cta
          onClick={() => open({ from: "hero" })}
          className="group mt-9 inline-flex min-h-14 items-center gap-2 rounded-full bg-gold px-8 text-base font-semibold text-[#1b1e21] transition-[background-color,transform] duration-200 ease-out hover:bg-[#ffd07a] active:scale-[0.98] active:bg-[#f0b444] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Book your free trial lesson
          <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-5 pb-9 md:pb-20">
        <div
          onClick={() => track("vsl_play")}
          className="pc-frame relative aspect-video w-full overflow-hidden rounded-[20px] bg-band-c md:rounded-[24px]"
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
