"use client";

import { useSyncExternalStore } from "react";
import { DEMO } from "@/lib/demo";

/**
 * The server's clock, as seen from this phone.
 *
 * A test's start time comes from the server, but the countdown runs on the
 * phone. A phone set a few minutes fast loses those minutes, and one an hour
 * out (a wrong time zone fixed by hand) can hand in a blank paper at once. So
 * the gap between the two clocks is measured once from a server reply, and
 * the test screens count with the corrected time. If it can't be measured
 * (offline, the preview), the phone's own clock is used, as before.
 */
let offset = 0;
let measured = false;
const listeners = new Set<() => void>();

/** Now, on the server's clock (or the phone's, if the gap is unknown). */
export const serverNow = () => Date.now() + offset;

/** The gap in ms (server minus phone), 0 until measured. */
export const clockOffset = () => offset;

/**
 * Takes a reading from a server reply: `serverMs` is the server's time, sent
 * between `sentAt` and `gotAt` on the phone's clock. A slow reply says little
 * about the exact time, so readings that took over 4 seconds are ignored, and
 * a gap under a second is left alone (not worth moving the timer for).
 */
export function noteServerTime(serverMs: number, sentAt: number, gotAt: number) {
  if (!Number.isFinite(serverMs) || gotAt - sentAt > 4_000) return;
  const gap = serverMs - (sentAt + gotAt) / 2;
  const next = Math.abs(gap) < 1_000 ? 0 : Math.round(gap);
  measured = true;
  if (next === offset) return;
  offset = next;
  listeners.forEach((l) => l());
}

let syncing: Promise<void> | null = null;
/** One quick reading, at most once per page load (again only after a failure). */
export function syncServerClock(): Promise<void> {
  if (DEMO || measured || typeof window === "undefined") return Promise.resolve();
  syncing ??= (async () => {
    try {
      const sentAt = Date.now();
      const res = await fetch("/api/test-draft?time=1", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
      const gotAt = Date.now();
      if (!res.ok) return;
      const j = (await res.json()) as { now?: number };
      if (typeof j.now === "number") noteServerTime(j.now, sentAt, gotAt);
    } catch {
      /* offline: the phone's clock it is */
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** The gap as React state, so a screen redraws when it is first measured. */
export function useClockOffset(): number {
  return useSyncExternalStore(subscribe, clockOffset, () => 0);
}
