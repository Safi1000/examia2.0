"use client";

import { useEffect } from "react";
import { DEMO } from "@/lib/demo";
import {
  DEFAULT_SCHEDULE,
  applyDayChange,
  cleanSchedule,
  getSchedule,
  pkDate,
  scheduleLoaded,
  setSchedule,
  type DayChange,
  type Schedule,
} from "@/lib/timetable";

const DEMO_KEY = "ht_demo_schedule";

/**
 * Load the saved timetable (or the demo one) into the page. Throws when the
 * server can't be reached or answers with an error, so a failed load is never
 * mistaken for "nothing saved yet" (that would show, and let Hamza save over
 * his timetable with, the starting one).
 * `fresh` skips the shared 30-second copy: Hamza's own pages always read the latest.
 */
export async function fetchSchedule(fresh = false) {
  if (DEMO) {
    try {
      return cleanSchedule(JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null"));
    } catch {
      return null;
    }
  }
  const res = await fetch(fresh ? `/api/schedule?t=${Date.now()}` : "/api/schedule", { cache: "no-store" });
  if (!res.ok) throw new Error("schedule");
  const s = cleanSchedule(await res.json());
  if (!s) throw new Error("schedule");
  return s;
}

/** Preview only: keep an edited timetable in this browser. */
export function saveDemoSchedule(v: unknown) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(v));
  } catch {}
}

/** When this device last saved a change (see `SETTLE_MS`). */
let savedAt = 0;
/**
 * After a save here, the server's shared copies can lag for up to a minute and
 * a half. Until then this device trusts what it just saved, not a re-read.
 */
const SETTLE_MS = 90_000;
/** Look again when the portal comes back to the front, at most this often. */
const STALE_MS = 60_000;
/** And every few minutes while it stays open (a class moved or called off just before it starts). */
const REFRESH_MS = 5 * 60_000;

/**
 * Wraps the portal: shows pages straight away with the default timetable,
 * then loads Hamza's saved one; pages showing classes pick it up live. A
 * portal left open (the home-screen app) checks again when it comes back to
 * the front and every few minutes, so a cancelled or moved class never keeps
 * its old Join time. A load that fails is tried again.
 */
export function ScheduleGate({ children, fresh = false }: { children: React.ReactNode; fresh?: boolean }) {
  useEffect(() => {
    let alive = true;
    let busy = false;
    let last = 0;
    let tries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      if (busy || !alive) return;
      busy = true;
      clearTimeout(retry);
      try {
        const s = await fetchSchedule(fresh);
        if (!alive) return;
        last = Date.now();
        tries = 0;
        if (Date.now() - savedAt < SETTLE_MS) return;
        // The same timetable as before: leave the pages alone (nothing re-renders or resets).
        if (scheduleLoaded() && JSON.stringify(s ?? DEFAULT_SCHEDULE) === JSON.stringify(getSchedule())) return;
        setSchedule(s);
      } catch {
        // Weak signal: 2 s, 4 s, 8 s… then leave it to the next visit or the timer below.
        if (alive && tries < 5) retry = setTimeout(() => void load(), 2000 * 2 ** tries++);
      } finally {
        busy = false;
      }
    };

    void load();
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - last > STALE_MS) void load();
    };
    const onOnline = () => void load();
    const timer = setInterval(onShow, REFRESH_MS);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("online", onOnline);
    };
  }, [fresh]);
  // Pages subscribe with useSchedule(), so nothing remounts (unsaved work and timers survive).
  return <>{children}</>;
}

/**
 * Hamza's edits. Sent as small operations and applied on the server to the
 * latest saved timetable, so a change made on the phone is never undone by
 * an older copy open on the laptop.
 */
type Op = { op: "weekly"; termStarts: string; days: number[]; slots: Schedule["slots"] } | ({ op: "day" } & DayChange);

async function send(op: Op): Promise<Schedule> {
  if (DEMO) {
    let cur: Schedule | null = null;
    try {
      cur = cleanSchedule(JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null"));
    } catch {}
    const base = cur ?? DEFAULT_SCHEDULE;
    const next = cleanSchedule(op.op === "weekly" ? { ...base, termStarts: op.termStarts, days: op.days, slots: op.slots } : applyDayChange(base, op, pkDate(Date.now())));
    if (!next) throw new Error("That timetable has a mistake in it.");
    saveDemoSchedule(next);
    savedAt = Date.now();
    setSchedule(next);
    return next;
  }
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/schedule", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(op),
  }).catch(() => null);
  if (!res) throw new Error("Can't reach the server. Check your internet and try again.");
  const body = await res.json().catch(() => ({}));
  // The server answers with a sentence for mistakes Hamza can fix, and a bare code otherwise.
  if (res.status === 403) throw new Error("Your session has expired. Sign in again, then save.");
  if (!res.ok) throw new Error(typeof body.error === "string" && /^[A-Z]/.test(body.error) ? body.error : "Couldn't save. Try again.");
  const saved = cleanSchedule(body);
  if (!saved) throw new Error("Couldn't save. Try again.");
  savedAt = Date.now();
  setSchedule(saved);
  return saved;
}

/** Save the weekly timetable (days, term start, classes). One-day changes are kept. */
export const saveWeekly = (s: Pick<Schedule, "termStarts" | "days" | "slots">) =>
  send({ op: "weekly", termStarts: s.termStarts, days: s.days, slots: s.slots });

/** Cancel, move or add a class on one date (or undo that with change: null). */
export const saveDayChange = (c: DayChange & { notify?: boolean }) => send({ op: "day", ...c });
