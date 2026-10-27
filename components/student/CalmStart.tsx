"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { pkDate } from "@/lib/timetable";
import { SCENES, greeting, quoteFor, sceneFor, type Scene } from "@/lib/groundwork";

/**
 * Groundwork's start screen, in the spirit of a calm new-tab page: a scene
 * (sky and hills drawn in code), the time, a greeting, today's one thing,
 * a way to start, and a quote. Tap the scene name to change it.
 */
export function CalmStart({ name, nowMs, onStart, missionLabel, onMission }: { name: string; nowMs: number; onStart: () => void; missionLabel?: string; onMission?: () => void }) {
  const { profile, updateProfile } = useAuth();
  const scene = sceneFor(profile.scene, nowMs);
  const quote = quoteFor(nowMs);
  const today = pkDate(nowMs);
  const focus = profile.today?.date === today ? profile.today : null;
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const time = new Date(nowMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[ap]m$/i, "");
  const ampm = new Date(nowMs).getHours() < 12 ? "am" : "pm";

  const nextScene = () => {
    const i = SCENES.findIndex((s) => s.id === scene.id);
    updateProfile({ scene: SCENES[(i + 1) % SCENES.length].id });
  };
  const saveFocus = () => {
    const text = draft.trim().slice(0, 80);
    if (!text) return;
    updateProfile({ today: { date: today, text } });
    setDraft("");
    setEditing(false);
  };

  return (
    <section className="calm relative isolate flex min-h-[68dvh] flex-col overflow-hidden rounded-[28px] text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,.6)]" style={{ background: scene.sky }}>
      <Sky scene={scene} />

      <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-7 sm:pt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80">Groundwork</p>
        <button
          type="button"
          onClick={nextScene}
          className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label={`Scene: ${scene.name}. Change scene`}
        >
          {scene.name} ↻
        </button>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <p className="calm-time font-extralight tabular-nums leading-none tracking-[-0.04em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,.25)]">
          {time}
          <span className="ml-1 align-top text-[0.22em] font-medium tracking-normal text-white/80">{ampm}</span>
        </p>
        <h1 className="mt-3 text-[1.6rem] font-semibold tracking-[-0.01em] text-white sm:text-[2rem]">
          {greeting(nowMs)}, {name}.
        </h1>

        <div className="mt-7 w-full max-w-md">
          {focus && !editing ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">Today</p>
              <button
                type="button"
                onClick={() => updateProfile({ today: { ...focus, done: !focus.done } })}
                className="group mt-2 inline-flex items-center gap-3 text-left text-xl font-medium text-white"
                aria-pressed={!!focus.done}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${focus.done ? "border-white bg-white text-black" : "border-white/80 group-hover:bg-white/15"}`} aria-hidden>
                  {focus.done ? "✓" : ""}
                </span>
                <span className={focus.done ? "line-through decoration-white/60" : ""}>{focus.text}</span>
              </button>
              <button type="button" onClick={() => (setDraft(focus.text), setEditing(true))} className="mt-2 block w-full text-xs text-white/60 hover:text-white">
                Change
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveFocus();
              }}
            >
              <label htmlFor="calm-focus" className="text-lg font-medium text-white/95">
                What’s your one thing today?
              </label>
              <input
                id="calm-focus"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={80}
                autoComplete="off"
                placeholder="e.g. Depreciation questions"
                className="mt-3 w-full border-0 border-b-2 border-white/50 bg-transparent pb-2 text-center text-xl text-white outline-none placeholder:text-white/45 focus:border-white"
              />
            </form>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" onClick={onStart} className="inline-flex h-12 items-center rounded-full bg-white px-7 text-base font-semibold text-black shadow-lg transition active:scale-[0.98]">
            Start a session
          </button>
          {missionLabel && onMission && (
            <button type="button" onClick={onMission} className="inline-flex h-12 items-center rounded-full bg-white/15 px-5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/25">
              Mission: {missionLabel}
            </button>
          )}
        </div>
      </div>

      <figure className="relative z-10 mx-auto max-w-lg px-6 pb-6 text-center">
        <blockquote className="text-sm leading-relaxed text-white/90 [text-wrap:balance]">“{quote.q}”</blockquote>
        <figcaption className="mt-1 text-xs text-white/65">{quote.by}</figcaption>
      </figure>

      <style>{`
        .calm-time { font-size: clamp(4.5rem, 20vw, 7.5rem); }
        .calm-drift { animation: calm-drift 40s ease-in-out infinite alternate; }
        .calm-twinkle { animation: calm-twinkle 4s ease-in-out infinite alternate; }
        @keyframes calm-drift { from { transform: translate3d(-4%, 0, 0); } to { transform: translate3d(4%, -2%, 0); } }
        @keyframes calm-twinkle { from { opacity: .35; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .calm-drift, .calm-twinkle { animation: none; } }
      `}</style>
    </section>
  );
}

/** Stars, glow and three hill lines, drawn as SVG. */
function Sky({ scene }: { scene: Scene }) {
  const hill = (base: number, amp: number, phase: number) => {
    let d = `M0 100 L0 ${base}`;
    for (let x = 0; x <= 100; x += 2) d += ` L${x} ${(base + Math.sin(x / 9 + phase) * amp + Math.sin(x / 3.3 + phase * 2) * amp * 0.25).toFixed(2)}`;
    return `${d} L100 100 Z`;
  };
  return (
    <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
      <div className="calm-drift absolute -inset-10" style={{ background: `radial-gradient(45% 35% at 70% 30%, ${scene.glow}, transparent 70%)` }} />
      {scene.stars && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {STARS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="white" className={i % 3 === 0 ? "calm-twinkle" : ""} style={{ animationDelay: `${(i % 7) * 0.6}s` }} />
          ))}
        </svg>
      )}
      <svg className="absolute inset-x-0 bottom-0 h-[42%] w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d={hill(38, 9, 1)} fill={scene.hills[0]} />
        <path d={hill(58, 8, 2.4)} fill={scene.hills[1]} />
        <path d={hill(78, 6, 4)} fill={scene.hills[2]} />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),transparent_35%,transparent_60%,rgba(0,0,0,.35))]" />
    </div>
  );
}

// Fixed star positions (x, y, radius) in the top half, so they never jump.
const STARS: Array<[number, number, number]> = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 37.7) % 100;
  const y = ((i * 53.3) % 55) + 2;
  return [x, y, i % 5 === 0 ? 0.28 : 0.14];
});
