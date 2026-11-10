/**
 * Pure time + countdown helpers. Kept side-effect-free so they're testable;
 * "now" is always passed in by callers (hooks own the clock).
 */

/** Format seconds as mm:ss (or h:mm:ss past an hour). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type TimerState = "normal" | "warning" | "critical";

/**
 * Timer color logic (recolored, same thresholds as the original spec):
 *  - critical  ≤ 60s remaining (pulses)
 *  - warning   ≤ 5 minutes remaining (final-five warning)
 *  - normal    otherwise
 */
export function timerState(remainingSeconds: number): TimerState {
  if (remainingSeconds <= 60) return "critical";
  if (remainingSeconds <= 5 * 60) return "warning";
  return "normal";
}

/** Whole seconds between two ISO timestamps (b - a). */
export function secondsBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 1000);
}

/** Human duration like "42m 10s" from a second count. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/** "2:05 pm" → "2:05 PM", so every time in the portal reads the same as the timetable. */
const upperMeridiem = (s: string) => s.replace(/\s?(am|pm)\b/i, (_, m: string) => ` ${m.toUpperCase()}`);

const PK = "Asia/Karachi";

/**
 * True on a device set to another time zone (the Gulf): a time then needs
 * saying both ways. Same rule as lib/timetable.ts (`clockHere`). Only ever true
 * in the browser, so a server render reads exactly as before.
 */
const awayFromPakistan = (d: Date) =>
  typeof window !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone !== PK && d.getTimezoneOffset() !== -300;

const dayKey = (d: Date, timeZone?: string) => d.toLocaleDateString("en-CA", { timeZone });

/**
 * "4:30 PM your time (5:30 PM Pakistan)" style: the date and time on this
 * device, then the Pakistan time (with its date when the day differs).
 */
function bothWays(d: Date, local: Intl.DateTimeFormatOptions): string {
  const time: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
  const here = upperMeridiem(d.toLocaleString("en-GB", { ...local, ...time }));
  const sameDay = dayKey(d) === dayKey(d, PK);
  const there = upperMeridiem(
    d.toLocaleString("en-GB", sameDay ? { timeZone: PK, ...time } : { timeZone: PK, weekday: "short", day: "numeric", month: "short", ...time }),
  );
  return `${here} your time (${there} Pakistan)`;
}

/**
 * Friendly absolute timestamp in Pakistan time, e.g. "17 Jun 2026, 2:05 PM".
 * On a device in another time zone: "17 Jun 2026, 1:05 PM your time (2:05 PM Pakistan)".
 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (awayFromPakistan(d)) return bothWays(d, { day: "numeric", month: "short", year: "numeric" });
  return upperMeridiem(d.toLocaleString("en-GB", {
    timeZone: PK,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }));
}

/**
 * Short day and time in Pakistan time, e.g. "Mon 3 Nov, 5:30 PM".
 * On a device in another time zone: "Mon 3 Nov, 4:30 PM your time (5:30 PM Pakistan)".
 */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (awayFromPakistan(d)) return bothWays(d, { weekday: "short", day: "numeric", month: "short" });
  return upperMeridiem(d.toLocaleString("en-GB", {
    timeZone: PK,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }));
}

/** "2 Nov 2026", in Pakistan time. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "in 3 hours", "in 2 days", "in 25 min" — for deadlines on cards. */
export function formatRelative(iso: string, nowMs: number): string {
  const mins = Math.round((+new Date(iso) - nowMs) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Test scheduling state relative to a supplied `now`. */
export type TestWindow = "future" | "open" | "closed";

export function testWindow(opensAt: string, closesAt: string, nowMs: number): TestWindow {
  const open = new Date(opensAt).getTime();
  const close = new Date(closesAt).getTime();
  if (nowMs < open) return "future";
  if (nowMs >= close) return "closed";
  return "open";
}

/**
 * ISO -> value for <input type="datetime-local">, always in Pakistan time (no
 * seconds), so test times are the same whichever device or country Hamza is on.
 */
export function toLocalInput(iso: string): string {
  const d = new Date(+new Date(iso) + 5 * 3_600_000); // Pakistan is UTC+5, no daylight saving
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Value from <input type="datetime-local"> (Pakistan time) -> ISO. */
export function fromLocalInput(v: string): string {
  return new Date(`${v.slice(0, 16)}:00+05:00`).toISOString();
}
