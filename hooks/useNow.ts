"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, as a render-safe external store.
 *
 * Calling `Date.now()` straight in a component body is impure — it makes render
 * output depend on when it ran. Reading the clock through a store keeps render
 * pure (the snapshot is cached and stable between ticks) and has the bonus that
 * time-dependent UI — "opens in 5 min", open/closed test windows — refreshes on
 * its own instead of going stale until the next unrelated re-render.
 */
const TICK_MS = 30_000;

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const tick = () => {
  now = Date.now();
  listeners.forEach((l) => l());
};
// Back from Meet or another app: the phone paused the timer, so read the clock straight away.
const onShow = () => {
  if (document.visibilityState === "visible") tick();
};

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) {
    // Fresh reading when the clock wakes up again, never a stale one.
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
    }
  };
}

// Must be stable: returning a fresh Date.now() per call would loop forever.
const getSnapshot = () => now;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
