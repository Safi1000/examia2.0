/**
 * Who may open which class recording, and until when. Pure, so the teacher's
 * Recordings page, the student's Classes page and the server all decide the
 * same way.
 *
 * A recording is open to students when ANY of these is still running:
 *   1. its normal window: 48 hours after the class ends (lib/class-automation.ts);
 *   2. a catch-up window: "Open all recordings to students for 48 hours", which
 *      covers every recording from classes on or before the day it was pressed;
 *   3. its own "Open for 48 hours" from the Recordings page.
 * "Close now" on one recording beats all three until it is opened again.
 *
 * The state lives in one private JSON file (Storage bucket "teacher",
 * recordings.json), written only by app/api/recordings with the server key.
 * No database change.
 */

/** How long "Open all recordings" and "Open for 48 hours" keep a recording open. */
export const CATCH_UP_HOURS = 48;
/** Hamza is reminded to give older recordings new links after this many days. */
export const REFRESH_EVERY_DAYS = 30;

export interface CatchUpRun {
  startedAt: number;
  endsAt: number;
  /** Covers recordings from classes on or before this Pakistan date. */
  upTo: string;
  /** Recordings it applies to when it started. */
  total: number;
  /** Still to open in Drive: slot key and Drive file id. */
  todo: Array<{ k: string; f: string }>;
  /** Google refused these: slot key → file id and a short reason. */
  failed: Record<string, { f: string; why: string }>;
}

export interface AccessFile {
  v: 1;
  catchUp: CatchUpRun | null;
  /** The last finished catch-up, for the page's history line. */
  lastCatchUp?: { startedAt: number; endsAt: number; opened: number; failed: number } | null;
  /** Per recording: open until this time (ms), or 0 = closed by hand. */
  overrides: Record<string, number>;
  /**
   * Recordings whose link sharing the site opened for a window (not their
   * normal 48 hours), with the Drive file id: closed again by the scheduled
   * job once nothing keeps them open. `tries` counts failed closes.
   */
  shared: Record<string, { f: string; tries?: number }>;
  /** When older recordings last got new links. */
  refreshedAt: number | null;
}

export const emptyAccess = (): AccessFile => ({ v: 1, catchUp: null, lastCatchUp: null, overrides: {}, shared: {}, refreshedAt: null });

/** A tidy copy of whatever was stored, so a bad file can never break a page. */
export function cleanAccess(v: unknown): AccessFile {
  const x = (v ?? {}) as Partial<AccessFile>;
  const out = emptyAccess();
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
  if (x.catchUp && typeof x.catchUp === "object" && typeof x.catchUp.upTo === "string") {
    const c = x.catchUp;
    out.catchUp = {
      startedAt: num(c.startedAt),
      endsAt: num(c.endsAt),
      upTo: c.upTo,
      total: num(c.total),
      todo: Array.isArray(c.todo) ? c.todo.filter((t) => t && typeof t.k === "string" && typeof t.f === "string") : [],
      failed: c.failed && typeof c.failed === "object" ? c.failed : {},
    };
  }
  if (x.lastCatchUp && typeof x.lastCatchUp === "object") out.lastCatchUp = x.lastCatchUp;
  if (x.overrides && typeof x.overrides === "object") for (const [k, n] of Object.entries(x.overrides)) if (typeof n === "number") out.overrides[k] = n;
  if (x.shared && typeof x.shared === "object") for (const [k, s] of Object.entries(x.shared)) if (s && typeof s.f === "string") out.shared[k] = { f: s.f, ...(s.tries ? { tries: num(s.tries) } : {}) };
  out.refreshedAt = typeof x.refreshedAt === "number" ? x.refreshedAt : null;
  return out;
}

/** What a page needs to decide "open or closed" (students get only their own part). */
export interface AccessView {
  /** A catch-up window that is running, or null. */
  catchUpUntil: number | null;
  upTo: string | null;
  overrides: Record<string, number>;
  /** In the catch-up, but Google would not open it: never shown as open. */
  hidden: string[];
}

export const noAccess: AccessView = { catchUpUntil: null, upTo: null, overrides: {}, hidden: [] };

export function viewOf(a: AccessFile, now: number): AccessView {
  const running = a.catchUp && a.catchUp.endsAt > now ? a.catchUp : null;
  return {
    catchUpUntil: running?.endsAt ?? null,
    upTo: running?.upTo ?? null,
    overrides: a.overrides,
    hidden: running ? [...Object.keys(running.failed), ...running.todo.map((t) => t.k)] : [],
  };
}

/**
 * Until when students can open this recording (ms), or 0 when closed.
 * `normalClose` is its own 48 hours (0 if unknown or long past).
 */
export function openUntil(key: string, date: string, normalClose: number, v: AccessView, now: number): number {
  const own = v.overrides[key];
  if (own === 0) return 0; // closed by hand
  let until = normalClose > now ? normalClose : 0;
  if (own && own > now) until = Math.max(until, own);
  if (v.catchUpUntil && v.catchUpUntil > now && v.upTo && date <= v.upTo && !v.hidden.includes(key)) until = Math.max(until, v.catchUpUntil);
  return until;
}

/** "2026-11-03|<class>|<subject>" → its parts. */
export function splitKey(key: string) {
  const [date, classId, subjectId] = key.split("|");
  return { date, classId, subjectId };
}

/** Pakistan time, the teacher's own clock: "Wed 9:00 pm". */
export function pkWhen(ms: number) {
  const day = new Date(ms).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Karachi" });
  const time = new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).toLowerCase();
  return `${day} ${time}`;
}

/** "Wed 13 Nov at 9:00 pm", for the confirmation, so the end date is plain. */
export function pkWhenLong(ms: number) {
  const day = new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });
  const time = new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).toLowerCase();
  return `${day} at ${time}`;
}
