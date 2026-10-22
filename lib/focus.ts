import type { FocusStats } from "@/lib/profile";
import { addDays, pkDate } from "@/lib/timetable";

/** Session lengths offered by the study timer, in minutes. */
export const FOCUS_MODES = [
  { id: "pomodoro", label: "Classic", focus: 25, rest: 5 },
  { id: "deep", label: "Deep work", focus: 50, rest: 10 },
  { id: "quick", label: "Quick start", focus: 15, rest: 3 },
] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

/** Shortest stretch that still counts towards the week (so a mis-tap isn't logged). */
export const MIN_COUNTED = 5;

/** Monday of the Pakistan week containing `ymd`. */
export function mondayOf(ymd: string): string {
  const wd = new Date(`${ymd}T12:00:00+05:00`).getUTCDay();
  return addDays(ymd, -((wd + 6) % 7));
}

/** This week's view of the stats (a new week starts from zero; a missed day ends the streak). */
export function currentStats(f: FocusStats | undefined, nowMs: number): FocusStats {
  const today = pkDate(nowMs);
  const base: FocusStats = f ?? { streak: 0, lastDay: null, weekOf: null, weekMinutes: 0, bySubject: {} };
  const week = mondayOf(today);
  const sameWeek = base.weekOf === week;
  const alive = base.lastDay === today || base.lastDay === addDays(today, -1);
  return {
    streak: alive ? base.streak : 0,
    lastDay: base.lastDay,
    weekOf: week,
    weekMinutes: sameWeek ? base.weekMinutes : 0,
    bySubject: sameWeek ? base.bySubject : {},
  };
}

/** Add a finished stretch of focus. */
export function recordFocus(f: FocusStats | undefined, minutes: number, subject: string, nowMs: number): FocusStats {
  const today = pkDate(nowMs);
  const cur = currentStats(f, nowMs);
  const streak = cur.lastDay === today ? Math.max(1, cur.streak) : cur.streak + 1;
  return {
    streak,
    lastDay: today,
    weekOf: cur.weekOf,
    weekMinutes: cur.weekMinutes + minutes,
    bySubject: { ...cur.bySubject, [subject]: (cur.bySubject[subject] ?? 0) + minutes },
  };
}

/**
 * A line for the focus screen. Classic, short and public-domain, plus Iqbal,
 * and a few plain study reminders (no attribution).
 */
export const QUOTES: Array<{ text: string; by?: string }> = [
  { text: "Well begun is half done.", by: "Aristotle" },
  { text: "Energy and persistence conquer all things.", by: "Benjamin Franklin" },
  { text: "Knowledge is power.", by: "Francis Bacon" },
  { text: "What we learn with pleasure we never forget.", by: "Alfred Mercier" },
  { text: "Khudi ko kar buland itna ke har taqdeer se pehle, Khuda bande se khud pooche, bata teri raza kya hai.", by: "Allama Iqbal" },
  { text: "Sitaron se aage jahan aur bhi hain.", by: "Allama Iqbal" },
  { text: "One focused hour beats three distracted ones." },
  { text: "Phone face down. Just this one session." },
  { text: "Past papers show you exactly what the examiner wants." },
  { text: "Stuck for five minutes? Mark it, move on, come back." },
  { text: "Small daily wins add up to an A*." },
];

export const quoteFor = (seed: number) => QUOTES[Math.abs(seed) % QUOTES.length];
