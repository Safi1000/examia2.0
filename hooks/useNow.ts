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

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Must be stable: returning a fresh Date.now() per call would loop forever.
const getSnapshot = () => now;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
