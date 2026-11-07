"use client";

import { useAuth } from "@/lib/auth-context";
import { SCENES, greeting, quoteFor, sceneFor, type Scene } from "@/lib/groundwork";

/**
 * Groundwork's first screen, in the spirit of a calm new-tab page but
 * quieter: a soft colour, the time, a greeting, one Start, and a line of
 * quote at the bottom. Plans and goals wait further down the page.
 */
export function CalmStart({ name, nowMs, onStart }: { name: string; nowMs: number; onStart: () => void }) {
  const { profile, updateProfile } = useAuth();
  const scene = sceneFor(profile.scene, nowMs);
  const quote = quoteFor(nowMs);
  const time = new Date(nowMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).replace(/\s?[ap]m$/i, "");

  const nextScene = () => {
    const i = SCENES.findIndex((s) => s.id === scene.id);
    updateProfile({ scene: SCENES[(i + 1) % SCENES.length].id });
  };

  return (
    <section
      className="calm relative isolate -mx-4 -mt-6 flex min-h-[calc(100dvh-68px)] flex-col overflow-hidden text-white sm:mx-0 sm:mt-0 sm:min-h-[min(640px,calc(100dvh-140px))] sm:rounded-[32px]"
      style={{ background: scene.sky }}
      aria-label="Groundwork"
    >
      <Sky scene={scene} />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
        <p className="calm-time font-light leading-none tabular-nums tracking-[-0.05em]">{time}</p>
        <h1 className="mt-4 text-[1.6rem] font-medium tracking-[-0.02em] text-white/90 sm:text-[2rem]">
          {greeting(nowMs)}, {name}.
        </h1>
        <button
          type="button"
          onClick={onStart}
          className="mt-10 h-12 rounded-full border border-white/25 bg-white/10 px-8 text-[15px] font-medium text-white backdrop-blur-xl transition hover:bg-white/20 active:scale-[0.98]"
        >
          Start focus
        </button>
      </div>

      <div className="relative z-10 flex items-end justify-between gap-6 px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pb-6">
        <button type="button" onClick={nextScene} className="min-h-11 shrink-0 text-[12px] text-white/45 transition hover:text-white/80" aria-label={`Background: ${scene.name}. Change it`}>
          {scene.name}
        </button>
        <p className="max-w-md text-center text-[13px] leading-relaxed text-white/55 [text-wrap:balance]">
          “{quote.q}” <span className="text-white/35">{quote.by}</span>
        </p>
        <span className="w-12 shrink-0" aria-hidden />
      </div>

      <style>{`
        .calm-time { font-size: clamp(5.5rem, 26vw, 10rem); }
        .calm-breathe { animation: calm-breathe 24s ease-in-out infinite alternate; }
        @keyframes calm-breathe { from { transform: scale(1) translate3d(0,0,0); } to { transform: scale(1.12) translate3d(2%, -2%, 0); } }
        .calm-photo { animation: calm-in 1.2s ease-out both; }
        @keyframes calm-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .calm-breathe, .calm-photo { animation: none; } }
      `}</style>
    </section>
  );
}

/** A slowly breathing colour wash; or, for anyone who picked one, a photo or drawn scene, shaded. */
function Sky({ scene }: { scene: Scene }) {
  if (scene.photo) {
    return (
      <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
        <picture>
          <source media="(min-width: 768px)" srcSet={`/wallpapers/${scene.photo}.jpg`} />
          <img src={`/wallpapers/${scene.photo}-m.jpg`} alt="" className="calm-photo absolute inset-0 h-full w-full object-cover" decoding="async" />
        </picture>
        <div className="absolute inset-0 bg-black/45" />
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden" aria-hidden>
      <div className="calm-breathe absolute -inset-[15%]" style={{ background: scene.sky }} />
      {!scene.calm && <div className="absolute inset-0 bg-black/25" />}
    </div>
  );
}
