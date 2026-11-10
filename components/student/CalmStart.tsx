"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { greeting, quoteFor } from "@/lib/groundwork";
import { worldFor } from "@/lib/groundwork-worlds";
import { GroundworkWorld } from "@/components/student/GroundworkWorld";
import { WorldGlyph, WorldPicker } from "@/components/student/WorldPicker";

/**
 * Groundwork's first screen, like a calm new-tab page: the student's 3D world
 * filling the whole window (behind the header too), resting before a block,
 * with the time, a greeting, one Start and a line of quote. The world stays
 * put while the rest of the page slides up over it as a frosted sheet. A small
 * picker swaps the world. `away` (the focus room is open on top) stops drawing
 * it here, so only one world runs at a time.
 */
export function CalmStart({ name, nowMs, onStart, away = false }: { name: string; nowMs: number; onStart: () => void; away?: boolean }) {
  const { profile, updateProfile } = useAuth();
  const world = worldFor(profile.world);
  const quote = quoteFor(nowMs);
  const time = new Date(nowMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).replace(/\s?[ap]m$/i, "");
  const [tray, setTray] = useState(false);

  return (
    <>
      <Backdrop world={world.id} away={away} />
      <section className="calm relative flex min-h-[calc(100svh-68px)] flex-col text-white" aria-label="Groundwork">
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 text-center">
          <p className="calm-time font-semibold leading-none tabular-nums tracking-[-0.045em] [text-shadow:0_2px_30px_rgba(0,0,0,.25)]">{time}</p>
          <h1 className="mt-3 text-[1.6rem] font-medium tracking-[-0.02em] text-white/95 [text-shadow:0_1px_16px_rgba(0,0,0,.35)] sm:text-[2.4rem]">
            {greeting(nowMs)}, {name}.
          </h1>
          <button
            type="button"
            onClick={onStart}
            className="mt-9 h-12 rounded-full border border-white/30 bg-white/15 px-8 text-[15px] font-semibold text-white shadow-[0_8px_30px_-10px_rgba(0,0,0,.5)] backdrop-blur-xl transition hover:bg-white/25 active:scale-[0.98]"
          >
            Start focus
          </button>
        </div>

        <div className="relative grid grid-cols-[1fr_auto] items-end gap-4 px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:grid-cols-[1fr_minmax(0,36rem)_1fr] sm:px-8 sm:pb-7">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTray((v) => !v)}
              aria-expanded={tray}
              aria-label={`World: ${world.title}. Change world`}
              className="group flex min-h-11 items-center gap-2 text-left text-[12px] text-white/70 transition hover:text-white"
            >
              <WorldGlyph />
              <span className="max-w-[9rem] truncate [text-shadow:0_1px_8px_rgba(0,0,0,.5)] sm:max-w-none">{world.title}</span>
            </button>
            {tray && <WorldPicker current={world.id} onPick={(id) => updateProfile({ world: id })} onClose={() => setTray(false)} />}
          </div>
          <p className="col-span-2 row-start-1 mx-auto max-w-xl text-center text-[13px] leading-relaxed text-white/80 [text-shadow:0_1px_10px_rgba(0,0,0,.5)] [text-wrap:balance] sm:col-span-1 sm:col-start-2 sm:row-start-auto sm:text-[14px]">
            “{quote.q}” <span className="text-white/55">{quote.by}</span>
          </p>
          <a href="#groundwork-more" className="hidden min-h-11 items-center justify-self-end text-[12px] text-white/60 transition hover:text-white sm:flex" aria-label="Your week and today">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="calm-bob" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </a>
        </div>

        <style>{`
          .calm-time { font-size: clamp(6rem, 24vw, 13rem); }
          .calm-bob { animation: calm-bob 2.4s ease-in-out infinite; }
          @keyframes calm-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
          @media (prefers-reduced-motion: reduce) { .calm-bob { animation: none; } }
        `}</style>
      </section>
    </>
  );
}

/** The whole window, fixed: the world at rest, and soft shades so white text reads. */
function Backdrop({ world, away }: { world: string; away: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {away ? (
        <div className="absolute inset-0" style={{ background: worldFor(world).sky }} />
      ) : (
        <GroundworkWorld world={world} progress={0} phase="idle" className="absolute inset-0 overflow-hidden" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_42%,rgba(0,0,0,.28),transparent_75%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}
