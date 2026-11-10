"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadWorld, worldFor, type WorldHandle, type WorldId, type WorldModule, type WorldPhase, type WorldQuality } from "@/lib/groundwork-worlds";

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
 * Changing world cross-fades to the new one. When the tab is hidden the world
 * is told it is paused, and on return it jumps to the true progress. The 3D
 * code loads only here, in the browser.
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
  const autoQuality = useSyncExternalStore(noop, pickQuality, () => null);
  const reduceMotion = useSyncExternalStore(subscribeReduce, readReduce, () => false);
  const hidden = useSyncExternalStore(subscribeHidden, () => document.visibilityState === "hidden", () => false);
  const q = quality ?? autoQuality;

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
    <div className={className ?? "pointer-events-none fixed inset-0 overflow-hidden"} aria-hidden style={{ background: worldFor(layers[0].id).sky, isolation: "isolate" }}>
      {q &&
        layers.map((l, i) => (
          <WorldLayer
            key={l.key}
            layerKey={l.key}
            id={l.id}
            first={i === 0 && l.key === 0}
            top={l.key === topKey}
            progress={progress}
            phase={phase}
            hidden={hidden}
            quality={q}
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
  hidden,
  quality,
  reduceMotion,
  onReady,
}: {
  layerKey: number;
  id: WorldId;
  first: boolean;
  top: boolean;
  progress: number;
  phase: WorldPhase;
  hidden: boolean;
  quality: WorldQuality;
  reduceMotion: boolean;
  onReady: (key: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<WorldHandle | null>(null);
  const [ready, setReady] = useState(false);
  // The blurred still stays until the world has faded in over it, then goes (no blur left under a running world).
  const [settled, setSettled] = useState(false);
  const p = clamp01(progress);
  // What the world should show right now: a hidden tab rests, as if paused.
  const shownPhase: WorldPhase = hidden && phase === "building" ? "paused" : phase;
  const latest = useRef({ p, phase: shownPhase });
  useEffect(() => {
    latest.current = { p, phase: shownPhase };
  });

  // Mount the world (again if the quality tier or motion setting changes).
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
      onReady(layerKey);
    };
    const start = (mod: WorldModule) => {
      if (gone) return;
      try {
        handle = mod.mount(el, { reduceMotion, quality });
      } catch (e) {
        // No WebGL (old phone, blocked GPU): the world's still and colours stay instead.
        console.warn("[groundwork] world could not start", e);
        return shown();
      }
      api.current = handle;
      size();
      ro = new ResizeObserver(size);
      ro.observe(el);
      window.addEventListener("resize", size);
      handle.setProgress(latest.current.p, { instant: true });
      handle.setPhase(latest.current.phase);
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
        shown();
      });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(wait);
      clearTimeout(later);
      ro?.disconnect();
      window.removeEventListener("resize", size);
      api.current = null;
      try {
        handle?.dispose();
      } catch {}
      el.remove();
      // Free the GPU context right after the next paint: not before it (the room's clock and buttons
      // show first) and not in the middle of building the next world (on a modest phone it waits for the GPU).
      if (handle) toLose(el);
    };
    // onReady and layerKey are stable for a layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, quality, reduceMotion]);

  // The timer: progress every tick, phase on change.
  const prev = useRef({ p, phase: shownPhase, hidden });
  useEffect(() => {
    const h = api.current;
    const was = prev.current;
    prev.current = { p, phase: shownPhase, hidden };
    if (!h) return;
    // Jump (no catch-up animation) after a pause, on coming back to the tab, and when a new block starts from zero.
    // Also any big jump forward (the page was frozen for a while): the world goes straight there, no fast-forward.
    const instant = (was.phase === "paused" && shownPhase !== "paused") || (was.hidden && !hidden) || Math.abs(p - was.p) > 0.02;
    if (instant || p !== was.p) h.setProgress(p, instant ? { instant: true } : undefined);
    if (shownPhase !== was.phase) h.setPhase(shownPhase);
  }, [p, shownPhase, hidden]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setSettled(true), FADE_MS + 100);
    return () => clearTimeout(t);
  }, [ready]);

  const info = worldFor(id);
  return (
    <div
      className="absolute inset-0 transition-opacity ease-out"
      style={{ opacity: first || ready ? 1 : 0, transitionDuration: `${FADE_MS}ms`, background: info.sky, zIndex: top ? 1 : 0 }}
    >
      {/* The world's still, softly blurred (no build detail it hasn't earned), shown at once while the 3D loads. */}
      {!settled && (
        <div
          className="absolute -inset-8 bg-cover bg-center"
          style={{ backgroundImage: `url(${info.still})`, filter: "blur(28px) brightness(0.7) saturate(1.1)" }}
        />
      )}
      <div ref={box} className="absolute inset-0 transition-opacity ease-out" style={{ opacity: ready ? 1 : 0, transitionDuration: `${FADE_MS}ms` }} />
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
