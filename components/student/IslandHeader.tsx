"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { pickQuality } from "@/components/student/GroundworkWorld";
import {
  loadIsland,
  piecesFor,
  type IslandHandle,
  type IslandTimeOfDay,
} from "@/lib/island-growth";
import { focusRoomOpen, subscribeFocusRoom } from "@/components/student/focus-away";

/**
 * The Home greeting band with the student's own island ("Your island grows").
 * Every full focus block (25 minutes, all time) adds one piece, so over a term
 * the island becomes theirs. The same minutes always give the same island.
 *
 * The bare island picture for the time of day (portal-art/scenes/island-bare)
 * shows at once; the live island fades in over it once it has drawn, and the
 * picture simply stays if 3D can't run.
 * Phones: the picture is a band of its own with the words below it.
 * Computers: the picture fills the band and the words sit in its dark left side.
 * The newest piece rises in gently the first time the student sees it (not with
 * reduced motion). The last count seen is kept in this browser only.
 */
export function IslandHeader({
  studentId,
  totalMinutes,
  timeOfDay,
  children,
  className,
}: {
  studentId: string;
  /** All time focus minutes (FocusStats.totalMinutes). */
  totalMinutes: number | undefined;
  timeOfDay: IslandTimeOfDay;
  /** The greeting (date, hello, status line). */
  children: React.ReactNode;
  className?: string;
}) {
  const pieces = piecesFor(totalMinutes);
  // The little note shows on the first two visits only, then the island speaks for itself.
  const showNote = useSyncExternalStore(
    noop,
    () => homeVisit() <= 2,
    () => false,
  );
  const quality = useSyncExternalStore(noop, pickQuality, () => null);
  const reduceMotion = useSyncExternalStore(
    subscribeReduce,
    readReduce,
    () => false,
  );
  // The focus room open on top: the island stops drawing, so a phone never runs two 3D scenes.
  const covered = useSyncExternalStore(subscribeFocusRoom, focusRoomOpen, () => false);
  const art = useRef<HTMLDivElement>(null);
  const handle = useRef<IslandHandle | null>(null);
  const shown = useRef<{ studentId: string; pieces: number } | null>(null);
  const [live, setLive] = useState(false);
  /** Bumped when the phone gives the drawing back after taking it away: the island starts again on a fresh canvas. */
  const [restarts, setRestarts] = useState(0);
  const latest = useRef({ studentId, pieces, timeOfDay, covered });
  useEffect(() => {
    latest.current = { studentId, pieces, timeOfDay, covered };
  });

  // Start the live island (again if the quality tier or motion setting changes).
  // Each mount gets a fresh canvas: a WebGL context, once let go, can't be reused.
  useEffect(() => {
    const host = art.current;
    if (!host || !quality) return;
    const el = document.createElement("canvas");
    el.className = "absolute inset-0 block h-full w-full";
    host.appendChild(el);
    let gone = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let h: IslandHandle | null = null;
    const size = () => {
      const r = el.getBoundingClientRect();
      if (h && r.width > 0 && r.height > 0) h.resize(r.width, r.height);
    };
    // Back from another app (Meet, WhatsApp), a phone can take the 3D drawing away and the canvas goes black.
    // The still picture shows meanwhile; when the drawing comes back the island starts again.
    const lost = (e: Event) => {
      e.preventDefault();
      setLive(false);
    };
    const restored = () => setRestarts((n) => n + 1);
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", restored);
    // three.js (about 150 KB compressed, plus compiling it and starting WebGL) waits
    // until the browser is idle after Home has painted, so on a phone it never
    // competes with the page's own scripts and data. The still picture covers the wait.
    let idle = 0;
    // Older Safari has no requestIdleCallback: a short timer stands in.
    const ric = typeof window.requestIdleCallback === "function";
    const afterIdle = new Promise<void>((resolve) => {
      idle = ric ? window.requestIdleCallback(() => resolve(), { timeout: 2500 }) : window.setTimeout(resolve, 600);
    });
    afterIdle
      .then(() => (gone ? Promise.reject(new Error("gone")) : loadIsland()))
      .then((mount) => {
        if (gone) return;
        try {
          h = mount(el, { quality, reduceMotion });
        } catch (e) {
          // No WebGL (old phone, blocked GPU): the picture stays.
          console.warn("[island] could not start", e);
          return;
        }
        handle.current = h;
        size();
        ro = new ResizeObserver(size);
        ro.observe(el);
        const now = latest.current;
        const seen = readSeen(now.studentId);
        h.set({
          seed: now.studentId,
          pieces: now.pieces,
          timeOfDay: now.timeOfDay,
          riseFrom: seen === null ? now.pieces - 1 : seen,
        });
        writeSeen(now.studentId, now.pieces);
        shown.current = { studentId: now.studentId, pieces: now.pieces };
        if (now.covered) h.hold(true);
        // Two frames: the first one drawn, then fade it in.
        raf = requestAnimationFrame(
          () => (raf = requestAnimationFrame(() => !gone && setLive(true))),
        );
      })
      .catch((e) => {
        if (!gone) console.warn("[island] could not load", e);
      });
    return () => {
      gone = true;
      if (ric) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      el.removeEventListener("webglcontextlost", lost);
      el.removeEventListener("webglcontextrestored", restored);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      handle.current = null;
      try {
        h?.dispose();
      } catch {}
      el.remove();
    };
  }, [quality, reduceMotion, restarts]);

  useEffect(() => {
    handle.current?.hold(covered);
  }, [covered]);

  // New pieces while the page is open (a block just finished) rise in too.
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    const prev = shown.current;
    const riseFrom =
      prev && prev.studentId === studentId && pieces > prev.pieces
        ? prev.pieces
        : undefined;
    h.set({ seed: studentId, pieces, timeOfDay, riseFrom });
    writeSeen(studentId, pieces);
    shown.current = { studentId, pieces };
  }, [studentId, pieces, timeOfDay]);

  // The bare island (no pieces) for this time of day, drawn from the live scene with the same framing,
  // so the fade is seamless and no student ever sees trees they have not earned (also the fallback without 3D).
  const pic = (layout: "phone" | "desktop") =>
    `/portal-art/scenes/island-bare/header-${timeOfDay}-${layout}`;
  const caption =
    pieces === 0
      ? "Your first focus block adds a piece"
      : `${pieces} ${pieces === 1 ? "piece" : "pieces"} built`;

  return (
    <header
      className={cn(
        "surface relative isolate overflow-hidden rounded-xl",
        className,
      )}
    >
      <div className="relative aspect-[390/210] w-full [mask-image:linear-gradient(180deg,#000_62%,transparent)] sm:absolute sm:inset-0 sm:-z-20 sm:aspect-auto sm:[mask-image:none]">
        {/* Plain img: the art is already web sized, and it must show before any script runs.
            One <picture>, so a phone downloads only the phone art (two eager imgs, one
            display:none, made phones fetch the 50 to 60 KB desktop art too).
            40rem is Tailwind's sm breakpoint, where the layout switches. */}
        <picture>
          <source
            media="(min-width: 40rem)"
            srcSet={`${pic("desktop")}.webp 1x, ${pic("desktop")}@2x.webp 2x`}
            width={1200}
            height={360}
          />
          <img
            src={`${pic("phone")}.webp`}
            srcSet={`${pic("phone")}.webp 1x, ${pic("phone")}@2x.webp 2x`}
            alt=""
            width={390}
            height={210}
            loading="eager"
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover sm:object-right"
          />
        </picture>
        <div
          ref={art}
          aria-hidden
          className="absolute inset-0 transition-opacity duration-[900ms] ease-out"
          style={{ opacity: live ? 1 : 0 }}
        />
        {/* A quiet note in the corner, first two visits only. */}
        {showNote && (
          <p className="absolute right-3 top-3 rounded-full bg-[rgba(20,22,24,0.55)] px-2.5 py-1 text-xs font-medium tabular-nums text-ink-2 sm:bottom-3 sm:right-4 sm:top-auto">
            {caption}
          </p>
        )}
      </div>
      {/* Computers: deepens the left side a touch for long names; the right stays clear. */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,rgba(20,22,24,0.55)_0%,rgba(20,22,24,0.2)_42%,rgba(20,22,24,0)_60%)] sm:block"
      />
      {/* The words stay inside the picture's safe zone: the left half, middle band. */}
      <div className="px-5 pb-6 pt-2 sm:flex sm:min-h-[232px] sm:max-w-[50%] sm:flex-col sm:justify-center sm:px-6 sm:py-8 lg:max-w-[48%]">
        {children}
      </div>
    </header>
  );
}

const SEEN_KEY = (id: string) => `island_seen:${id}`;
function readSeen(id: string): number | null {
  try {
    const v = localStorage.getItem(SEEN_KEY(id));
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
function writeSeen(id: string, n: number) {
  try {
    localStorage.setItem(SEEN_KEY(id), String(n));
  } catch {}
}

const noop = () => () => {};

/** Which visit to Home this is, counted once per page load and kept in this browser only. */
let visit: number | null = null;
function homeVisit(): number {
  if (visit === null) {
    try {
      visit = Number(localStorage.getItem("ht-island-visits") || "0") + 1;
      localStorage.setItem("ht-island-visits", String(visit));
    } catch {
      visit = 99;
    }
  }
  return visit;
}
const REDUCE = "(prefers-reduced-motion: reduce)";
const readReduce = () => matchMedia(REDUCE).matches;
const subscribeReduce = (cb: () => void) => {
  const m = matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
