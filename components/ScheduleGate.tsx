"use client";

import { useEffect } from "react";
import { DEMO } from "@/lib/demo";
import { applyDayChange, cleanSchedule, setSchedule, type DayChange, type Schedule } from "@/lib/timetable";

const DEMO_KEY = "ht_demo_schedule";

/** Load the saved timetable (or the demo one) into the page. */
export async function fetchSchedule() {
  if (DEMO) {
    try {
      return cleanSchedule(JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null"));
    } catch {
      return null;
    }
  }
  const res = await fetch("/api/schedule", { cache: "no-store" });
  return res.ok ? cleanSchedule(await res.json()) : null;
}

/** Preview only: keep an edited timetable in this browser. */
export function saveDemoSchedule(v: unknown) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(v));
  } catch {}
}

/**
 * Wraps the portal: shows pages straight away with the default timetable,
 * then loads Hamza's saved one; pages showing classes pick it up live.
 */
export function ScheduleGate({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let alive = true;
    void fetchSchedule()
      .then((s) => alive && setSchedule(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
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
    const { DEFAULT_SCHEDULE, pkDate } = await import("@/lib/timetable");
    const base = cur ?? DEFAULT_SCHEDULE;
    const next = cleanSchedule(op.op === "weekly" ? { ...base, termStarts: op.termStarts, days: op.days, slots: op.slots } : applyDayChange(base, op, pkDate(Date.now())));
    if (!next) throw new Error("That timetable has a mistake in it.");
    saveDemoSchedule(next);
    setSchedule(next);
    return next;
  }
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/schedule", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify(op),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't save. Try again.");
  const saved = cleanSchedule(body);
  if (!saved) throw new Error("Couldn't save. Try again.");
  setSchedule(saved);
  return saved;
}

/** Save the weekly timetable (days, term start, classes). One-day changes are kept. */
export const saveWeekly = (s: Pick<Schedule, "termStarts" | "days" | "slots">) =>
  send({ op: "weekly", termStarts: s.termStarts, days: s.days, slots: s.slots });

/** Cancel, move or add a class on one date (or undo that with change: null). */
export const saveDayChange = (c: DayChange) => send({ op: "day", ...c });
