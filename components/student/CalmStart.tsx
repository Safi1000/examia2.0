"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { TRAY_SCENES, greeting, photoSrc, quoteFor, sceneFor, type Scene } from "@/lib/groundwork";

/**
 * Groundwork's first screen, like a calm new-tab page: one HD photo filling
 * the whole window (behind the header too), the time, a greeting, one Start,
 * and a line of quote. The photo stays put while the rest of the page slides
 * up over it as a frosted sheet. A small tray swaps the background.
 */
export function CalmStart({ name, nowMs, onStart }: { name: string; nowMs: number; onStart: () => void }) {
  const { profile, updateProfile } = useAuth();
  const scene = sceneFor(profile.scene, nowMs);
  const quote = quoteFor(nowMs);
  const time = new Date(nowMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).replace(/\s?[ap]m$/i, "");
  const [tray, setTray] = useState(false);

  return (
    <>
      <Backdrop scene={scene} />
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
              className="group flex min-h-11 items-center gap-2 text-left text-[12px] text-white/70 transition hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="m3 16 5-5 4 4 3-3 6 6" />
                <circle cx="16" cy="9" r="1.6" />
              </svg>
              <span className="max-w-[9rem] truncate [text-shadow:0_1px_8px_rgba(0,0,0,.5)] sm:max-w-none">{scene.name}</span>
            </button>
            {tray && <Tray current={profile.scene ?? ""} auto={!profile.scene} onPick={(id) => updateProfile({ scene: id })} onClose={() => setTray(false)} />}
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
          .calm-photo { animation: calm-in 900ms ease-out both; }
          @keyframes calm-in { from { opacity: 0; transform: scale(1.03); } to { opacity: 1; transform: scale(1); } }
          .calm-breathe { animation: calm-breathe 24s ease-in-out infinite alternate; }
          @keyframes calm-breathe { from { transform: scale(1); } to { transform: scale(1.12) translate3d(2%, -2%, 0); } }
          @media (prefers-reduced-motion: reduce) { .calm-bob, .calm-photo, .calm-breathe { animation: none; } }
        `}</style>
      </section>
    </>
  );
}

/** The whole window, fixed: the photo (or a colour wash) and a soft shade so white text reads. */
function Backdrop({ scene }: { scene: Scene }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: scene.sky }} aria-hidden>
      {scene.photo ? (
        <picture key={scene.id}>
          <source media="(min-width: 768px)" srcSet={photoSrc(scene)} />
          <img src={photoSrc(scene, "tall")} alt="" className="calm-photo absolute inset-0 h-full w-full object-cover" decoding="async" fetchPriority="high" />
        </picture>
      ) : (
        <div className="calm-breathe absolute -inset-[15%]" style={{ background: scene.sky }} />
      )}
      <div className={`absolute inset-0 ${scene.light ? "bg-black/25" : "bg-black/10"}`} />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}

/** A small floating tray of backgrounds: "New each day", the photos, then plain colours. */
function Tray({ current, auto, onPick, onClose }: { current: string; auto: boolean; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => document.addEventListener("pointerdown", away));
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const photos = TRAY_SCENES.filter((s) => s.photo);
  const washes = TRAY_SCENES.filter((s) => !s.photo);
  const tile = "relative overflow-hidden rounded-xl outline-none ring-offset-2 ring-offset-black/40 transition focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Background"
      className="absolute bottom-full left-0 z-20 mb-2 w-[min(23rem,calc(100vw-2.5rem))] rounded-[22px] border border-white/15 bg-black/45 p-3 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-2xl"
    >
      <div className="mb-2.5 flex items-center justify-between px-1">
        <p className="text-[13px] font-semibold">Background</p>
        <button
          type="button"
          onClick={() => onPick("")}
          aria-pressed={auto}
          className={`min-h-9 rounded-full px-3 text-[12px] font-medium transition ${auto ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
        >
          New each day
        </button>
      </div>
      <div className="grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto">
        {photos.map((s) => (
          <button key={s.id} type="button" onClick={() => onPick(s.id)} aria-pressed={current === s.id} aria-label={s.name} title={s.name} className={`${tile} aspect-[3/2] ${current === s.id ? "ring-2 ring-white" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(s, "thumb")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 hover:scale-105" style={{ background: s.sky }} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {washes.map((s) => (
          <button key={s.id} type="button" onClick={() => onPick(s.id)} aria-pressed={current === s.id} aria-label={`${s.name} colour`} title={s.name} className={`${tile} h-9 flex-1 ${current === s.id ? "ring-2 ring-white" : ""}`} style={{ background: s.sky }} />
        ))}
      </div>
    </div>
  );
}
