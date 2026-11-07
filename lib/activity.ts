/**
 * Student activity: how long each student actively uses the portal, where,
 * and which notes they read. For Hamza only; students never see it.
 *
 * Kept as one small private file per student per month in Supabase Storage
 * (bucket "activity", `<studentId>/<yyyy-mm>.json`), so no database change
 * was needed. Times are seconds of active use (the page open and in front,
 * and the student touched, typed or scrolled recently), by Pakistan day.
 */

export const AREAS = ["groundwork", "notes", "tests", "homework", "classes", "plan", "home", "other"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  groundwork: "Groundwork",
  notes: "Notes",
  tests: "Tests and results",
  homework: "Homework",
  classes: "Classes",
  plan: "Plan and progress",
  home: "Home",
  other: "Everything else",
};

/** The day tracking began on the live site: nothing before it was recorded. */
export const TRACKING_SINCE = "2026-11-07";

/** One day: seconds per area, and first and last active moments (ms). */
export type DayActivity = { s: Partial<Record<Area, number>>; a?: number; b?: number };
/** One note over a month: seconds reading, pages spent time on, page count, last opened (ms). */
export type NoteActivity = { s: number; p: number[]; t: number; at: number };
export type MonthFile = { v: 1; days: Record<string, DayActivity>; notes: Record<string, NoteActivity> };

/** What the admin page gets for each student. */
export type StudentActivity = { days: Record<string, DayActivity>; notes: Record<string, NoteActivity>; signIn?: string | null };

export function areaOf(pathname: string): Area {
  const p = pathname.split("?")[0];
  if (p.startsWith("/groundwork")) return "groundwork";
  if (p.startsWith("/notes")) return "notes";
  if (p.startsWith("/test") || p.startsWith("/results")) return "tests";
  if (p.startsWith("/assignments")) return "homework";
  if (p.startsWith("/classes")) return "classes";
  if (p.startsWith("/plan") || p.startsWith("/progress")) return "plan";
  if (p.startsWith("/dashboard")) return "home";
  return "other";
}

export const daySecs = (d: DayActivity | undefined) => (d ? Object.values(d.s).reduce<number>((a, n) => a + (n ?? 0), 0) : 0);

/** Seconds in [from, to] (inclusive, yyyy-mm-dd). */
export function secsBetween(days: Record<string, DayActivity>, from: string, to: string) {
  let t = 0;
  for (const [d, v] of Object.entries(days)) if (d >= from && d <= to) t += daySecs(v);
  return t;
}

export function areasBetween(days: Record<string, DayActivity>, from: string, to: string) {
  const out: Partial<Record<Area, number>> = {};
  for (const [d, v] of Object.entries(days)) {
    if (d < from || d > to) continue;
    for (const [k, n] of Object.entries(v.s)) out[k as Area] = (out[k as Area] ?? 0) + (n ?? 0);
  }
  return out;
}

/** Days with at least a minute of use. */
export const activeDays = (days: Record<string, DayActivity>, from: string, to: string) =>
  Object.entries(days).filter(([d, v]) => d >= from && d <= to && daySecs(v) >= 60).length;

/** The latest moment we know they were in the portal (ms), from tracking or sign-in. */
export function lastSeen(a: StudentActivity | undefined): number | null {
  if (!a) return null;
  let best = a.signIn ? Date.parse(a.signIn) : 0;
  for (const v of Object.values(a.days)) if (v.b && v.b > best && daySecs(v) > 0) best = v.b;
  return best || null;
}

/** "45 min", "2 h 15 min", "Under a minute", "None". */
export function fmtTime(secs: number) {
  if (secs <= 0) return "None";
  const min = Math.round(secs / 60);
  if (min < 1) return "Under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  // Past 10 hours the minutes are noise, and the number stays on one line.
  return m && h < 10 ? `${h} h ${m} min` : `${h} h`;
}

/** Short form for tight spaces: "45m", "2h 15m". */
export function fmtShort(secs: number) {
  const min = Math.round(secs / 60);
  if (min < 1) return secs > 0 ? "<1m" : "0";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`;
}

/** "Today", "Yesterday", "3 days ago", "Never". */
export function fmtAgo(ms: number | null, nowMs: number) {
  if (!ms) return "Never";
  const pk = (x: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(x);
  const days = Math.round((Date.parse(`${pk(nowMs)}T12:00:00Z`) - Date.parse(`${pk(ms)}T12:00:00Z`)) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export const daysAgo = (ms: number | null, nowMs: number) => (ms ? Math.floor((nowMs - ms) / 864e5) : Infinity);

/** Merge one note's months together. */
export function mergeNote(a: NoteActivity | undefined, b: NoteActivity): NoteActivity {
  if (!a) return { ...b, p: [...b.p] };
  return { s: a.s + b.s, p: Array.from(new Set([...a.p, ...b.p])).sort((x, y) => x - y), t: Math.max(a.t, b.t), at: Math.max(a.at, b.at) };
}
