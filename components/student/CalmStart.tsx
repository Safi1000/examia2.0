"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { greeting, quoteFor } from "@/lib/groundwork";
import { WORLDS, worldFor, type WorldId } from "@/lib/groundwork-worlds";
import { GroundworkWorld } from "@/components/student/GroundworkWorld";
import { WorldGlyph, WorldPicker } from "@/components/student/WorldPicker";
import { buttonClasses } from "@/components/ui/Button";

/** The one time "Swipe to change the scene" hint: gone after the first swipe or the first block. */
const HINT_KEY = "gw_swipe_hint_v1";
/** The small handle at the foot bobs once, on the first visit only. */
const HANDLE_KEY = "gw_more_hint_v1";

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {}
}

/**
 * Groundwork's first screen, like a calm new-tab page: the student's 3D world
 * filling the whole window (behind the header too), resting before a block,
 * with the time, a greeting, one Start and a quiet line of quote at the foot.
 *
 * The scene changes by a swipe (phones and tablets): the live world slides
 * with the finger while the next world's still slides in beside it, and the
 * new world goes live when the finger lifts, so only one 3D world ever runs.
 * Four small dots under the clock show which world it is; a dot or the left
 * and right arrow keys change it too. Laptops also keep the named picker at
 * the lower left, since a mouse doesn't swipe.
 *
 * `away` (the focus room is open on top) stops drawing the world here, so only
 * one world runs at a time.
 */
export function CalmStart({ name, nowMs, onStart, away = false }: { name: string; nowMs: number; onStart: () => void; away?: boolean }) {
  const { profile, updateProfile } = useAuth();
  const world = worldFor(profile.world);
  const quote = quoteFor(nowMs);
  // The clock on the wall: the phone's own time (it showed Pakistan time, an hour ahead, on a phone in the Gulf).
  const clock = new Date(nowMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  const time = clock.replace(/\s?[ap]m$/i, "");
  // AM or PM in small type beside it, so the big numbers read as the time, not a countdown.
  const meridiem = /pm$/i.test(clock) ? "PM" : "AM";
  const [tray, setTray] = useState(false);

  // Hints read the phone's storage after the first paint (the server knows nothing of it).
  const [hint, setHint] = useState(false);
  const [bob, setBob] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setHint(!seen(HINT_KEY));
      if (!seen(HANDLE_KEY)) {
        setBob(true);
        markSeen(HANDLE_KEY);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const hintDone = () => {
    if (!hint) return;
    setHint(false);
    markSeen(HINT_KEY);
  };

  // ---- Changing the scene.
  const at = Math.max(0, WORLDS.findIndex((w) => w.id === world.id));
  const step = (dir: 1 | -1) => WORLDS[(at + dir + WORLDS.length) % WORLDS.length];
  /** The new world's still, held over the live one for a moment while it loads, then faded away. */
  const [cover, setCover] = useState<{ id: WorldId; fading: boolean } | null>(null);
  const pick = (id: WorldId, withCover: boolean) => {
    if (id === world.id) return;
    updateProfile({ world: id });
    hintDone();
    if (withCover) setCover({ id, fading: false });
  };
  useEffect(() => {
    if (!cover || cover.fading) return;
    const t = setTimeout(() => setCover((c) => (c ? { ...c, fading: true } : c)), 700);
    return () => clearTimeout(t);
  }, [cover]);
  useEffect(() => {
    if (!cover?.fading) return;
    const t = setTimeout(() => setCover(null), 500);
    return () => clearTimeout(t);
  }, [cover]);

  // The swipe: the live world and its neighbours' stills move together with the finger.
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; t: number; on: boolean; dx: number } | null>(null);
  const swipedAt = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    // A swipe is for fingers and pens; a mouse uses the dots, the arrow keys or the picker.
    if (e.pointerType === "mouse" || settling || cover || away) return;
    if ((e.target as Element).closest("button, a, select, input, [role=dialog]")) return;
    // Never from the edges, where the phone's own back swipe lives.
    if (e.clientX < 20 || e.clientX > window.innerWidth - 20) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, on: false, dx: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.on) {
      // Mostly up or down: that is a scroll, not a swipe.
      if (Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(mx) < 12) return;
      d.on = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    d.dx = mx;
    setDx(mx);
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.on) return;
    swipedAt.current = e.timeStamp;
    const width = window.innerWidth;
    const v = (d.dx / Math.max(1, e.timeStamp - d.t)) * 1000;
    const go = e.type !== "pointercancel" && (Math.abs(d.dx) > width * 0.22 || Math.abs(v) > 650);
    setSettling(true);
    if (!go) {
      setDx(0);
      setTimeout(() => setSettling(false), 240);
      return;
    }
    const dir: 1 | -1 = d.dx < 0 ? 1 : -1;
    setDx(-dir * width);
    setTimeout(() => {
      // The still that slid in takes the live world's place while the new world loads behind it.
      pick(step(dir).id, true);
      setSettling(false);
      setDx(0);
    }, 290);
  };
  // A finger that swiped never also taps the button it lifted over.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!swipedAt.current || e.timeStamp - swipedAt.current > 500) return;
    swipedAt.current = 0;
    e.preventDefault();
    e.stopPropagation();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.target as Element).closest("[role=dialog]")) return;
    e.preventDefault();
    const next = step(e.key === "ArrowRight" ? 1 : -1);
    pick(next.id, false);
  };
  // Focus follows the chosen dot, like any radio group.
  useEffect(() => {
    if (document.activeElement?.id.startsWith("gw-dot-")) document.getElementById(`gw-dot-${world.id}`)?.focus({ preventScroll: true });
  }, [world.id]);
  // The neighbours' stills are fetched once the page is idle, so a first swipe never shows an empty frame.
  useEffect(() => {
    const t = setTimeout(() => {
      for (const w of WORLDS) {
        const img = new Image();
        img.src = w.still;
      }
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  const moving = dx !== 0 || settling;
  const slide = settling ? "transform 280ms cubic-bezier(0.16,1,0.3,1)" : "none";

  return (
    <>
      <Backdrop
        world={world.id}
        away={away}
        dx={dx}
        slide={slide}
        next={moving ? step(1).id : null}
        prev={moving ? step(-1).id : null}
        cover={cover}
      />
      <section
        className="calm gw-snap relative flex flex-col text-white [touch-action:pan-y]"
        aria-label="Groundwork"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-6 text-center">
          <p className="calm-time font-semibold leading-none tabular-nums tracking-[-0.045em] [text-shadow:0_2px_30px_rgba(0,0,0,.25)]">
            {time}
            <span className="ml-2 text-2xl font-medium tracking-normal text-white/70 sm:text-3xl">{meridiem}</span>
          </p>
          {/* Which world: four small dots, the current one off-white. One tab stop; arrows move. */}
          <div role="radiogroup" aria-label="Scene" className="mt-1 flex items-center justify-center">
            {WORLDS.map((w) => {
              const on = w.id === world.id;
              return (
                <button
                  key={w.id}
                  id={`gw-dot-${w.id}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={w.title}
                  tabIndex={on ? 0 : -1}
                  onClick={() => pick(w.id, false)}
                  className="group flex h-11 w-6 items-center justify-center rounded-full outline-none"
                >
                  <span
                    aria-hidden
                    className={`block h-[5px] w-[5px] rounded-full transition-[background-color,box-shadow] duration-200 group-focus-visible:shadow-[0_0_0_3px_rgba(251,193,89,.9)] ${
                      on ? "bg-white/95" : "bg-white/30 group-hover:bg-white/60"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <h1 className="mt-1 text-title font-medium tracking-[-0.02em] text-white/95 [text-shadow:0_1px_16px_rgba(0,0,0,.35)] sm:text-title-lg">
            {greeting(nowMs)}, {name}.
          </h1>
          <button
            type="button"
            onClick={() => {
              hintDone();
              onStart();
            }}
            className={buttonClasses({ size: "lg", className: "mt-7 px-8 [@media(min-height:740px)]:mt-9" })}
          >
            Start focus
          </button>
        </div>

        {/* The foot: the first-visit hint, the quote, and the small handle to the rest of the page. */}
        <div className="calm-foot relative flex flex-col items-center px-6 text-center md:grid md:grid-cols-[1fr_minmax(0,36rem)_1fr] md:items-end md:gap-4 md:px-8">
          <div className="relative hidden md:block md:justify-self-start">
            <button
              type="button"
              onClick={() => setTray((v) => !v)}
              aria-expanded={tray}
              aria-label={`World: ${world.title}. Change world`}
              className="group flex min-h-11 items-center gap-2 text-left text-xs text-white/70 transition-colors duration-150 hover:text-white"
            >
              <WorldGlyph />
              <span className="[text-shadow:0_1px_8px_rgba(0,0,0,.5)]">{world.title}</span>
            </button>
            {tray && <WorldPicker current={world.id} onPick={(id) => updateProfile({ world: id })} onClose={() => setTray(false)} />}
          </div>
          <div className="flex flex-col items-center">
            {hint && (
              <p className="calm-hint mb-4 rounded-full bg-black/30 px-3 py-1.5 text-xs font-medium text-white/75 md:hidden" aria-hidden>
                Swipe to change the scene
              </p>
            )}
            <figure className="max-w-sm md:max-w-xl">
              <blockquote className="text-sm leading-relaxed text-white/75 [text-shadow:0_1px_10px_rgba(0,0,0,.55)] [text-wrap:balance]">{quote.by ? `“${quote.text}”` : quote.text}</blockquote>
              {quote.by && <figcaption className="mt-1 text-xs text-white/45 [text-shadow:0_1px_8px_rgba(0,0,0,.5)]">{quote.by}</figcaption>}
            </figure>
          </div>
          <a
            href="#groundwork-more"
            className={`group mt-1 flex h-11 w-16 items-center justify-center text-white/55 transition-colors duration-150 hover:text-white md:mt-0 md:justify-self-end ${bob ? "calm-bob" : ""}`}
            aria-label="This week and today, below"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </a>
        </div>

        <style>{`
          .calm-time { font-size: clamp(4.5rem, min(24vw, 22svh), 13rem); }
          /* The first screen is the whole window. On the web the portal's bar (68px) lies over its top; in the app, the status bar. */
          .calm { min-height: 100svh; padding-top: 68px; scroll-snap-align: start; }
          html[data-app] .calm { padding-top: env(safe-area-inset-top); }
          /* Clear of the floating tab bar: the portal's own on a phone (6rem), the app's dock in the app (112px). */
          .calm-foot { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)); }
          html[data-app] .calm-foot { padding-bottom: calc(104px + env(safe-area-inset-bottom)); }
          @media (min-width: 768px) { .calm-foot, html[data-app] .calm-foot { padding-bottom: 1.25rem; } }
          html:has(.gw-snap) { scroll-snap-type: y proximity; }
          html[data-app] #groundwork-more { scroll-margin-top: 0; }
          .calm-bob { animation: calm-bob 1.6s cubic-bezier(0.16,1,0.3,1) 1.2s 2 both; }
          @keyframes calm-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
          @media (prefers-reduced-motion: reduce) { .calm-bob { animation: none; } }
        `}</style>
      </section>
    </>
  );
}

/** The whole window, fixed: the world at rest, and soft shades so white text reads. */
function Backdrop({
  world,
  away,
  dx,
  slide,
  next,
  prev,
  cover,
}: {
  world: string;
  away: boolean;
  dx: number;
  slide: string;
  next: WorldId | null;
  prev: WorldId | null;
  cover: { id: WorldId; fading: boolean } | null;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ transform: `translate3d(${dx}px,0,0)`, transition: slide }}>
        {away ? (
          <div className="absolute inset-0" style={{ background: worldFor(world).sky }} />
        ) : (
          <GroundworkWorld world={world} progress={0} phase="idle" className="absolute inset-0 overflow-hidden" />
        )}
      </div>
      {next && <Still id={next} style={{ transform: `translate3d(calc(100% + ${dx}px),0,0)`, transition: slide }} />}
      {prev && <Still id={prev} style={{ transform: `translate3d(calc(-100% + ${dx}px),0,0)`, transition: slide }} />}
      {cover && <Still id={cover.id} style={{ opacity: cover.fading ? 0 : 1, transition: "opacity 450ms ease-out" }} />}
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_42%,rgba(0,0,0,.28),transparent_75%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}

/** A world that is not live: its portrait still over its own sky. */
function Still({ id, style }: { id: WorldId; style: React.CSSProperties }) {
  const w = worldFor(id);
  return (
    <div className="absolute inset-0 bg-cover bg-center" style={{ background: w.sky, ...style }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${w.still})` }} />
    </div>
  );
}
