"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { MIN_COUNTED, recordFocusOn } from "@/lib/focus";
import { trackFocusItem, type FocusItem } from "@/lib/activity-tracker";

/**
 * The Groundwork session running right now, kept on the phone so its minutes
 * survive Android Back, a closed app or a flat battery. FocusMode keeps it up
 * to date as the session goes. Minutes are added to the week when the session
 * ends in the app; if it was cut off, they're added on the next visit, once
 * the session is clearly over.
 *
 * Saving to the account needs the internet and can't finish while a page is
 * closing, so a closing page only writes here (instantly, on the phone) and the
 * next visit adds it. That way a minute is never added twice or lost.
 */
export interface RunningFocus {
  subject: string;
  /** Planned length of this focus stretch, in minutes. */
  planned: number;
  /** When this focus stretch started (ms). */
  startedAt: number;
  /** Time focused so far (ms), as of `savedAt`. */
  doneMs: number;
  savedAt: number;
  /** Whole minutes of it already added to the week. */
  logged: number;
  /** When they left Groundwork during it (stay to build); doneMs stops there. */
  awayAt?: number;
  /** The homework or test the block was started on, if any. */
  item?: FocusItem;
}

const KEY = "ht_focus_running";
/** This long past its planned end, a session isn't coming back. */
const STALE_MS = 10 * 60_000;

export function loadRunning(): RunningFocus | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as RunningFocus | null;
    return v && typeof v.startedAt === "number" && typeof v.doneMs === "number" && typeof v.subject === "string" ? v : null;
  } catch {
    return null;
  }
}

export function saveRunning(r: RunningFocus) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {}
}

export function clearRunning() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Whole minutes still to add (none until the session is long enough to count). */
export function minutesToAdd(doneMs: number, logged: number): number {
  const m = Math.floor(doneMs / 60_000) - logged;
  return m > 0 && logged + m >= MIN_COUNTED ? m : 0;
}

// True while a timer on this page owns the stored session, so it is never
// "recovered" from under a session that is still going.
let owned = false;
/** Shared by every tab of the portal: held for as long as a timer is running a session. */
const LOCK = "ht_focus_running";
type Locks = { request: (name: string, a: unknown, b?: unknown) => Promise<unknown> };
const locks = (): Locks | undefined => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { locks?: Locks }).locks);
let held: (() => void) | null = null;

export const ownRunning = (on: boolean) => {
  owned = on;
  if (!on) {
    held?.();
    held = null;
    return;
  }
  if (held) return;
  // Held until the timer lets go, and let go by the browser itself when the tab closes or dies:
  // that is how the next visit knows at once that a stored session is over.
  let free = () => {};
  const done = new Promise<void>((r) => (free = r));
  held = free;
  try {
    void locks()
      ?.request(LOCK, () => done)
      .catch(() => {});
  } catch {}
};

/**
 * Add what a cut-off session had done, once, then forget it. Runs when the
 * portal opens and each time the student comes back to it. With no timer
 * running it anywhere (the browser tells us), the session is over and is added
 * now; where the browser can't tell, it waits until the session is clearly over.
 */
export function useRecoverFocus(enabled: boolean) {
  const { updateProfile } = useAuth();
  useEffect(() => {
    if (!enabled) return;
    const settle = (startedAt: number) => {
      // Checked again at the last moment: a timer may have started, or another tab may have added it.
      const r = loadRunning();
      if (owned || !r || r.startedAt !== startedAt) return;
      clearRunning();
      const m = minutesToAdd(r.doneMs, r.logged);
      const at = Date.now();
      // Counted on the day it was studied, not the day the student came back.
      const when = Math.min(at, r.awayAt ?? r.savedAt ?? at);
      if (m > 0) {
        updateProfile((latest) => ({ focus: recordFocusOn(latest.focus, m, r.subject, when, at) }));
        trackFocusItem(r.item, m, when);
      }
    };
    const check = () => {
      if (owned || document.visibilityState === "hidden") return;
      const r = loadRunning();
      if (!r) return;
      const over = Date.now() >= r.startedAt + (r.planned || 0) * 60_000 + STALE_MS;
      const l = locks();
      if (!l) {
        if (over) settle(r.startedAt);
        return;
      }
      // Where the browser can tell, only "no timer holds it" counts as over: a timer paused for a long
      // time in another tab still owns its session and adds it itself, so adding it here would count it twice.
      l.request(LOCK, { ifAvailable: true }, (lock: unknown) => {
        if (lock) settle(r.startedAt);
      }).catch(() => {
        if (over) settle(r.startedAt);
      });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [enabled, updateProfile]);
}
