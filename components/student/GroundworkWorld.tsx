"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { loadWorld, worldFor, type WorldHandle, type WorldId, type WorldModule, type WorldPhase, type WorldQuality } from "@/lib/groundwork-worlds";
import type { WorldMountOptions } from "@/lib/groundwork-worlds/types";

/**
 * A Groundwork world, filling its box (the whole window, where it is used):
 * the chosen 3D scene, driven by the focus timer.
 *
 * - progress: the exact fraction of the current focus block done (0 to 1).
 * - phase: idle before a block, building while focusing, paused while paused,
 *   done after a finished block.
 *
 * While it loads (and if 3D can't run on the device) a soft, blurred still of
 * the world shows over its own dark colours, at once. The 3D world starts only
 * after the page around it has painted, compiles its shaders before its first
 * frame (off the main thread where the browser can), and then fades in.
 * Changing world cross-fades to the new one. When the tab is hidden or the
 * world is scrolled out of view it stops drawing (and is told it is paused),
 * and on return it jumps to the true progress. Phones and tablets get a
 * lighter tier (see pickWorldTier). If the GPU drops the world (a phone back
 * from another app) the still shows and the world starts again. The 3D code
 * loads only here, in the browser.
 */
export function GroundworkWorld({
  world,
  progress,
  phase,
  quality,
  className,
}: {
  world: string | undefined;
  progress: number;
  phase: WorldPhase;
  /** Force a tier; by default it is picked from the device (see pickQuality). */
  quality?: WorldQuality;
  className?: string;
}) {
  const id = worldFor(world).id;
  const autoTier = useSyncExternalStore(noop, pickWorldTier, () => null);
  const reduceMotion = useSyncExternalStore(subscribeReduce, readReduce, () => false);
  const hidden = useSyncExternalStore(subscribeHidden, () => document.visibilityState === "hidden", () => false);
  // A forced quality keeps the device's frame and pixel caps when it is "low".
  const picked = useMemo(
    () => (autoTier && quality && quality !== autoTier.quality ? (quality === "high" ? HIGH_TIER : { ...autoTier, quality }) : autoTier),
    [autoTier, quality],
  );
  // A laptop that can't keep the full world smooth (a fanless one, a big sharp screen) steps down
  // by itself: first fewer pixels, then the light tier. Remembered, so the next visit starts there.
  const [step, setStep] = useState(readStep);
  const tier = useMemo(() => (picked && !quality ? stepped(picked, step) : picked), [picked, quality, step]);

  // Scrolled out of view (the start screen's world, below the fold): rest, like a hidden tab.
  const root = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(node);
    return () => io.disconnect();
  }, []);
  const away = hidden || !onScreen;

  // Watch how smoothly the page is drawing while the world runs. Only where a lighter step exists
  // and no frame cap is set (a capped world is slow on purpose), and never for a forced quality.
  const canStep = !!tier && !quality && !tier.fps && step < 2 && (tier.quality === "high" || (tier.maxDpr ?? 2) > STEP_DPR);
  useEffect(() => {
    if (!canStep || away) return;
    let raf = 0;
    let last = 0;
    let slow = 0;
    let seen = 0;
    // The world loads and compiles first: start looking a few seconds in.
    const begin = window.setTimeout(() => {
      const tick = (t: number) => {
        const d = last ? t - last : 0;
        last = t;
        // A long gap is the tab or the machine pausing, not the world: it is left out.
        if (d > 0 && d < 250) {
          seen++;
          if (d > 22) slow++;
        }
        if (seen >= 180) {
          // Three frames in ten late (it is dropping below a steady 60): step down once.
          if (slow > seen * 0.3) {
            setStep((x) => {
              const next = Math.min(2, x + 1);
              try {
                localStorage.setItem(STEP_KEY, String(next));
              } catch {}
              return next;
            });
          }
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 5000);
    return () => {
      clearTimeout(begin);
      cancelAnimationFrame(raf);
    };
  }, [canStep, away, step]);

  // Layers: the current world on top; the one before it stays until the new one has drawn.
  const [layers, setLayers] = useState<Array<{ key: number; id: WorldId }>>(() => [{ key: 0, id }]);
  const [shownId, setShownId] = useState(id);
  if (id !== shownId) {
    setShownId(id);
    setLayers((ls) => [...ls.slice(-1), { key: (ls.at(-1)?.key ?? 0) + 1, id }]);
  }
  const topKey = layers.at(-1)!.key;
  const onReady = useCallback((key: number) => {
    // Let the fade finish, then drop (and dispose) the worlds underneath.
    setTimeout(() => setLayers((ls) => (ls.at(-1)?.key === key ? ls.filter((l) => l.key === key) : ls)), FADE_MS + 100);
  }, []);

  return (
    <div ref={root} className={className ?? "pointer-events-none fixed inset-0 overflow-hidden"} aria-hidden style={{ background: worldFor(layers[0].id).sky, isolation: "isolate" }}>
      {tier &&
        layers.map((l, i) => (
          <WorldLayer
            key={l.key}
            layerKey={l.key}
            id={l.id}
            first={i === 0 && l.key === 0}
            top={l.key === topKey}
            progress={progress}
            phase={phase}
            away={away}
            tier={tier}
            reduceMotion={reduceMotion}
            onReady={onReady}
          />
        ))}
    </div>
  );
}

const FADE_MS = 900;

function WorldLayer({
  layerKey,
  id,
  first,
  top,
  progress,
  phase,
  away,
  tier,
  reduceMotion,
  onReady,
}: {
  layerKey: number;
  id: WorldId;
  first: boolean;
  top: boolean;
  progress: number;
  phase: WorldPhase;
  /** Tab hidden or scrolled out of view: nothing is drawn. */
  away: boolean;
  tier: WorldTier;
  reduceMotion: boolean;
  onReady: (key: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<WorldHandle | null>(null);
  const [ready, setReady] = useState(false);
  // The blurred still stays until the world has faded in over it, then goes (no blur left under a running world).
  const [settled, setSettled] = useState(false);
  // No 3D on this device (or it failed to load): the still stays for good.
  const [failed, setFailed] = useState(false);
  // The GPU let the world go (a phone back from another app): the still shows until it is running again.
  const [broken, setBroken] = useState(false);
  // Bumped to start the world again after the GPU let it go.
  const [gen, setGen] = useState(0);
  const p = clamp01(progress);
  // What the world should show right now: a hidden tab or a world out of view rests, as if paused.
  const shownPhase: WorldPhase = away && phase === "building" ? "paused" : phase;
  const latest = useRef({ p, phase: shownPhase, away });
  useEffect(() => {
    latest.current = { p, phase: shownPhase, away };
  });

  // Mount the world (again if the tier or motion setting changes, or after the GPU let it go).
  // Each mount gets a fresh canvas: a WebGL context, once let go, can't be reused.
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const el = document.createElement("canvas");
    el.className = "absolute inset-0 block h-full w-full";
    host.appendChild(el);
    let gone = false;
    let raf = 0;
    let wait = 0;
    let later = 0;
    let ro: ResizeObserver | null = null;
    let handle: WorldHandle | null = null;
    // Only real size changes are passed on (each resize reallocates the drawing buffers, which is
    // slow on modest phones; the worlds also skip a resize that changes nothing).
    let sized = "";
    const size = () => {
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.width)}x${Math.round(r.height)}@${window.devicePixelRatio}`;
      if (!handle || r.width <= 0 || r.height <= 0 || key === sized) return;
      sized = key;
      handle.resize(r.width, r.height);
    };
    const shown = () => {
      if (gone) return;
      setReady(true);
      setBroken(false);
      onReady(layerKey);
    };
    const fail = () => {
      if (gone) return;
      setFailed(true);
      onReady(layerKey);
    };
    // The GPU let go of the world: show the still, and start again once the page is back (or the context returns).
    let relaunch = 0;
    const again = () => {
      if (gone || relaunch) return;
      relaunch = window.setTimeout(() => setGen((g) => g + 1), document.visibilityState === "visible" ? 1200 : 0);
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      setBroken(true);
      setReady(false);
      setSettled(false);
      if (document.visibilityState === "visible") again();
    };
    const onBack = () => {
      if (document.visibilityState === "visible" && el.dataset.lost) again();
    };
    const lostFlag = () => (el.dataset.lost = "1");
    el.addEventListener("webglcontextlost", lostFlag);
    el.addEventListener("webglcontextlost", onLost);
    el.addEventListener("webglcontextrestored", again);
    document.addEventListener("visibilitychange", onBack);
    const opts: WorldMountOptions = { reduceMotion, quality: tier.quality, fps: tier.fps, maxDpr: tier.maxDpr };
    const start = (mod: WorldModule) => {
      if (gone) return;
      try {
        handle = mod.mount(el, opts);
      } catch (e) {
        // No WebGL (old phone, blocked GPU): the world's still and colours stay instead.
        console.warn("[groundwork] world could not start", e);
        return fail();
      }
      api.current = handle;
      size();
      ro = new ResizeObserver(size);
      ro.observe(el);
      window.addEventListener("resize", size);
      handle.setProgress(latest.current.p, { instant: true });
      handle.setPhase(latest.current.phase);
      handle.setShown?.(!latest.current.away);
      // Shaders compiled, then two frames (the first one drawn), then fade it in.
      void Promise.resolve(handle.ready).then(() => {
        if (!gone) raf = requestAnimationFrame(() => (raf = requestAnimationFrame(shown)));
      });
    };
    loadWorld(id)
      .then((mod) => {
        // Let the page around the world paint first (the room's clock and buttons), then build it.
        if (!gone) wait = requestAnimationFrame(() => (later = window.setTimeout(() => start(mod), 0)));
      })
      .catch((e) => {
        console.warn("[groundwork] world could not load", e);
        fail();
      });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(wait);
      clearTimeout(later);
      clearTimeout(relaunch);
      ro?.disconnect();
      window.removeEventListener("resize", size);
      el.removeEventListener("webglcontextlost", lostFlag);
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", again);
      document.removeEventListener("visibilitychange", onBack);
      api.current = null;
      try {
        handle?.dispose();
      } catch {}
      el.remove();
      // Free the GPU context right after the next paint: not before it (the room's clock and buttons
      // show first) and not in the middle of building the next world (on a modest phone it waits for the GPU).
      if (handle && !el.dataset.lost) toLose(el);
    };
    // onReady and layerKey are stable for a layer; the tier object is made once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tier, reduceMotion, gen]);

  // The timer: progress every tick, phase on change.
  const prev = useRef({ p, phase: shownPhase, away });
  useEffect(() => {
    const h = api.current;
    const was = prev.current;
    prev.current = { p, phase: shownPhase, away };
    if (!h) return;
    // Jump (no catch-up animation) after a pause, on coming back to the tab or into view, and when a new block
    // starts from zero. Also any big jump forward (the page was frozen for a while): straight there, no fast-forward.
    const instant = (was.phase === "paused" && shownPhase !== "paused") || (was.away && !away) || Math.abs(p - was.p) > 0.02;
    if (instant || p !== was.p) h.setProgress(p, instant ? { instant: true } : undefined);
    if (shownPhase !== was.phase) h.setPhase(shownPhase);
    if (away !== was.away) h.setShown?.(!away);
  }, [p, shownPhase, away]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setSettled(true), FADE_MS + 100);
    return () => clearTimeout(t);
  }, [ready]);

  const info = worldFor(id);
  return (
    <div
      className="absolute inset-0 transition-opacity ease-out"
      style={{ opacity: first || ready || failed || broken ? 1 : 0, transitionDuration: `${FADE_MS}ms`, background: info.sky, zIndex: top ? 1 : 0 }}
    >
      {/* The world's still, softly blurred (no build detail it hasn't earned), shown at once while the 3D loads,
          and for good where 3D can't run. */}
      {(!settled || failed || broken) && (
        <div
          className="absolute -inset-8 bg-cover bg-center"
          style={{ backgroundImage: `url(${info.still})`, filter: "blur(28px) brightness(0.7) saturate(1.1)" }}
        />
      )}
      <div ref={box} className="absolute inset-0 transition-opacity ease-out" style={{ opacity: ready && !failed && !broken ? 1 : 0, transitionDuration: `${FADE_MS}ms` }} />
    </div>
  );
}

/**
 * The light tier for modest devices: little memory (4 GB or less), four
 * cores or fewer, or a small touch-only screen (a phone). Everything else
 * gets the full tier. `localStorage.gw_world_quality = "low" | "high"` overrides
 * it on one device (for testing).
 */
export function pickQuality(): WorldQuality {
  try {
    const forced = localStorage.getItem("gw_world_quality");
    if (forced === "low" || forced === "high") return forced;
  } catch {}
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory && nav.deviceMemory <= 4) return "low";
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) return "low";
  const touchOnly = matchMedia("(hover: none) and (pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 600;
  return touchOnly && small ? "low" : "high";
}

/**
 * How the Groundwork worlds are drawn on this device, picked once per page.
 * Laptops and desktops get the full tier, exactly as designed. Phones and
 * tablets (a touch-first screen), and modest machines (see pickQuality), get
 * the light tier: no real-time shadows or bloom, fewer particles, a lower
 * pixel ratio (1.25 on a phone or a modest device, 1.5 on a tablet) and, on
 * touch screens, at most 30 frames a second. `localStorage.gw_world_quality`
 * still forces "low" or "high" (for testing).
 */
export type WorldTier = { quality: WorldQuality; fps?: number; maxDpr?: number };
// The full look, at one and a half pixels per point at most: on a sharp laptop screen that is a
// little over half the pixels of drawing every one, for a scene with no fine print in it.
const HIGH_TIER: WorldTier = { quality: "high", maxDpr: 1.5 };
let tierMemo: WorldTier | null = null;
export function pickWorldTier(): WorldTier {
  if (tierMemo) return tierMemo;
  const base = pickQuality();
  let forced = false;
  try {
    forced = !!localStorage.getItem("gw_world_quality");
  } catch {}
  const touch = matchMedia("(pointer: coarse)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const modest = (!!nav.deviceMemory && nav.deviceMemory <= 4) || (!!nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
  const phone = Math.min(screen.width, screen.height) < 600;
  const low = forced ? base === "low" : base === "low" || touch;
  tierMemo = low ? { quality: "low", fps: touch ? 30 : undefined, maxDpr: phone || modest ? 1.25 : 1.5 } : HIGH_TIER;
  return tierMemo;
}

const STEP_KEY = "gw_world_step";
const STEP_DPR = 1.25;
/** How far this device has stepped down before (0: not at all). */
function readStep(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(localStorage.getItem(STEP_KEY));
    return n === 1 || n === 2 ? n : 0;
  } catch {
    return 0;
  }
}
/** The tier after stepping down: 1 keeps the look and draws fewer pixels, 2 is the light tier. */
function stepped(t: WorldTier, step: number): WorldTier {
  if (step >= 2) return { quality: "low", fps: t.fps, maxDpr: Math.min(t.maxDpr ?? STEP_DPR, STEP_DPR) };
  if (step === 1) return { ...t, maxDpr: Math.min(t.maxDpr ?? STEP_DPR, STEP_DPR) };
  return t;
}

// Canvases of worlds that have gone, whose GPU contexts are let go just after the next paint (see the unmount above).
const losing = new Set<HTMLCanvasElement>();
let loseTimer = 0;
function toLose(el: HTMLCanvasElement) {
  losing.add(el);
  // Never more than a couple waiting (a browser keeps only so many contexts), and none for long.
  if (losing.size > 2) return loseOld();
  if (!loseTimer) loseTimer = requestAnimationFrame(() => (loseTimer = window.setTimeout(loseOld, 0)));
}
function loseOld() {
  cancelAnimationFrame(loseTimer);
  clearTimeout(loseTimer);
  loseTimer = 0;
  losing.forEach((el) => {
    try {
      const gl = (el.getContext("webgl2") ?? el.getContext("webgl")) as WebGLRenderingContext | null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {}
  });
  losing.clear();
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const noop = () => () => {};
const REDUCE = "(prefers-reduced-motion: reduce)";
const readReduce = () => matchMedia(REDUCE).matches;
const subscribeReduce = (cb: () => void) => {
  const m = matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const subscribeHidden = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
