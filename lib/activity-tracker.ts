"use client";

import { pkDate } from "@/lib/timetable";
import { areaOf, type Area } from "@/lib/activity";

/**
 * Counts a student's active time in the portal, on their phone, and sends it
 * in small batches to /api/activity.
 *
 * Time only counts while the page is in front and they touched, typed or
 * scrolled recently (reading a note allows longer pauses than a menu does).
 * Counts are kept on the phone first, so closing the app loses nothing: what
 * didn't send goes with the next visit.
 */

const KEY = "ht-activity-buf";
/** Whose time the buffer holds: a shared phone must never credit one student's minutes to the next. */
const OWNER_KEY = "ht-activity-owner";
const TICK_MS = 5_000;
const FLUSH_MS = 120_000;
/** No input for this long and the time stops counting. */
const IDLE_MS = 90_000;
const NOTE_IDLE_MS = 5 * 60_000;

type NoteBuf = { s: number; p: number[]; t: number; at: number };
/** h and t: Groundwork seconds per homework and per test id, from blocks started on them. */
type DayBuf = { s: Partial<Record<Area, number>>; n?: Record<string, NoteBuf>; h?: Record<string, number>; t?: Record<string, number>; a: number; b: number };
type Buf = Record<string, DayBuf>;

let area: Area = "other";
let note: { id: string; page: number; total: number } | null = null;
let lastInput = Date.now();
let running = false;
/** The signed-in account the counting is for; nothing counts until it is known. */
let owner: string | null = null;

/** The account id inside a sign-in token (its `sub`), or null. Read only, never trusted by the server. */
function accountOf(token: string | null): string | null {
  try {
    const part = token?.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="))) as { sub?: unknown };
    return typeof json.sub === "string" && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}
function storedOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
/**
 * Make the buffer this account's. Time left by someone else on this phone is
 * dropped, not sent with this account's sign-in. A buffer from before the tag
 * existed has no owner and is kept (on most phones it is the same student).
 */
function claim(id: string) {
  const prev = storedOwner();
  if (prev && prev !== id) write({});
  try {
    localStorage.setItem(OWNER_KEY, id);
  } catch {}
}

function read(): Buf {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? (v as Buf) : {};
  } catch {
    return {};
  }
}
function write(b: Buf) {
  try {
    if (Object.keys(b).length) localStorage.setItem(KEY, JSON.stringify(b));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** Put a batch that failed to send back, adding to whatever has built up since. */
function mergeBack(sent: Buf) {
  const cur = read();
  for (const [day, d] of Object.entries(sent)) {
    const c = cur[day];
    if (!c) {
      cur[day] = d;
      continue;
    }
    for (const [k, n] of Object.entries(d.s)) c.s[k as Area] = (c.s[k as Area] ?? 0) + (n ?? 0);
    for (const [id, nb] of Object.entries(d.n ?? {})) {
      c.n ??= {};
      const x = c.n[id];
      c.n[id] = x ? { s: x.s + nb.s, p: Array.from(new Set([...x.p, ...nb.p])), t: Math.max(x.t, nb.t), at: Math.max(x.at, nb.at) } : nb;
    }
    for (const key of ["h", "t"] as const) {
      for (const [id, s] of Object.entries(d[key] ?? {})) {
        const m = (c[key] ??= {});
        m[id] = (m[id] ?? 0) + s;
      }
    }
    c.a = Math.min(c.a, d.a);
    c.b = Math.max(c.b, d.b);
  }
  write(cur);
}

function tick() {
  if (!owner || typeof document === "undefined" || document.visibilityState !== "visible") return;
  const now = Date.now();
  if (now - lastInput > (note ? NOTE_IDLE_MS : IDLE_MS)) return;
  const day = pkDate(now);
  const buf = read();
  const d = (buf[day] ??= { s: {}, a: now, b: now });
  const where: Area = note ? "notes" : area;
  d.s[where] = (d.s[where] ?? 0) + TICK_MS / 1000;
  d.b = now;
  if (note) {
    d.n ??= {};
    const n = (d.n[note.id] ??= { s: 0, p: [], t: note.total, at: now });
    n.s += TICK_MS / 1000;
    n.at = now;
    n.t = Math.max(n.t, note.total);
    if (note.page > 0 && !n.p.includes(note.page)) n.p.push(note.page);
  }
  write(buf);
}

async function flush(getToken: () => Promise<string | null>, closing = false) {
  const mine = owner;
  if (!mine) return;
  // Someone else's time (another student signed in on this phone meanwhile): never sent as this one's.
  const tag = storedOwner(); // null only where the phone won't store it: then nobody else's is there either
  if (tag && tag !== mine) return;
  const buf = read();
  if (!Object.keys(buf).length) return;
  write({});
  try {
    const token = await getToken();
    if (!token) throw new Error("signed out");
    const who = accountOf(token);
    // The sign-in changed since counting began: this time isn't theirs, drop it.
    if (who && who !== mine) return;
    const res = await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days: buf }),
      keepalive: closing,
    });
    if (!res.ok && res.status !== 400) throw new Error(String(res.status));
  } catch {
    // Kept for the next try, unless the phone has changed hands meanwhile.
    const now = storedOwner();
    if (!now || now === mine) mergeBack(buf);
  }
}

/** Start counting (students only). Returns a stop function. */
export function startActivity(getToken: () => Promise<string | null>): () => void {
  if (running || typeof window === "undefined") return () => {};
  running = true;
  const onInput = () => {
    lastInput = Date.now();
  };
  let lastMove = 0;
  const onMove = () => {
    const now = Date.now();
    if (now - lastMove > 5_000) {
      lastMove = now;
      lastInput = now;
    }
  };
  const onVis = () => {
    if (document.visibilityState === "hidden") void flush(getToken, true);
    else lastInput = Date.now();
  };
  const opts = { passive: true, capture: true } as const;
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel", "scroll"]) window.addEventListener(ev, onInput, opts);
  window.addEventListener("pointermove", onMove, opts);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onVis);
  let stopped = false;
  // Find out whose time this is before counting any of it (tried again with
  // each send if there was no signal at first).
  const ensureOwner = async () => {
    if (owner) return;
    const id = accountOf(await getToken().catch(() => null));
    if (stopped || !id) return;
    claim(id);
    owner = id;
  };
  void ensureOwner();
  const t = window.setInterval(tick, TICK_MS);
  const f = window.setInterval(() => void ensureOwner().then(() => flush(getToken)), FLUSH_MS);
  // Anything left from last time (closed app, no signal) goes now.
  const first = window.setTimeout(() => void ensureOwner().then(() => flush(getToken)), 4_000);
  return () => {
    stopped = true;
    running = false;
    owner = null;
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel", "scroll"]) window.removeEventListener(ev, onInput, opts);
    window.removeEventListener("pointermove", onMove, opts);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onVis);
    window.clearInterval(t);
    window.clearInterval(f);
    window.clearTimeout(first);
  };
}

/** A Groundwork block linked to a homework (by assignment id) or a test (by test id). */
export type FocusItem = { kind: "homework" | "test"; id: string };

/**
 * Count `minutes` of a Groundwork block against its homework or test. Called
 * exactly where those minutes are added to the student's week (FocusMode and
 * the cut-off recovery), so each minute is counted once here too. Goes into the
 * same buffer as the rest, so it is sent, tagged and retried the same way.
 * `whenMs` is the moment it was studied; a day older than the server accepts
 * is put on today instead, so recovered time isn't dropped.
 */
export function trackFocusItem(item: FocusItem | undefined, minutes: number, whenMs: number) {
  if (!item || typeof window === "undefined" || !(minutes > 0) || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) return;
  const now = Date.now();
  const today = pkDate(now);
  const then = pkDate(Math.min(whenMs, now));
  // The server takes today and the four days before it; one day of margin for a slow send.
  const day = Date.parse(`${today}T12:00:00Z`) - Date.parse(`${then}T12:00:00Z`) <= 3 * 864e5 ? then : today;
  const at = day === then ? Math.min(whenMs, now) : now;
  const buf = read();
  const d = (buf[day] ??= { s: {}, a: at, b: at });
  const key = item.kind === "test" ? "t" : "h";
  const m = (d[key] ??= {});
  m[item.id] = (m[item.id] ?? 0) + Math.round(minutes * 60);
  write(buf);
}

/** Which part of the portal is on screen. */
export function setActivityPath(pathname: string) {
  area = areaOf(pathname);
  lastInput = Date.now();
}

/** A note opened (with its page count once known) or closed (null). */
export function setActivityNote(id: string | null) {
  note = id ? { id, page: 0, total: 0 } : null;
  lastInput = Date.now();
}

export function setActivityNotePage(id: string, page: number, total: number) {
  if (note?.id === id) {
    note.page = page;
    note.total = total;
  }
}
