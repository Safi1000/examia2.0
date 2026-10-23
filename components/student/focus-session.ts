"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { MIN_COUNTED, recordFocus } from "@/lib/focus";

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
export const ownRunning = (on: boolean) => {
  owned = on;
};

/** On the next visit: add what a cut-off session had done, once, then forget it. */
export function useRecoverFocus(enabled: boolean) {
  const { updateProfile } = useAuth();
  useEffect(() => {
    if (!enabled || owned) return;
    const r = loadRunning();
    if (!r || Date.now() < r.startedAt + r.planned * 60_000 + STALE_MS) return;
    clearRunning();
    const m = minutesToAdd(r.doneMs, r.logged);
    if (m > 0) updateProfile((latest) => ({ focus: recordFocus(latest.focus, m, r.subject, Date.now()) }));
  }, [enabled, updateProfile]);
}
