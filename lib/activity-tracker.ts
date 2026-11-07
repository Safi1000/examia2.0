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
const TICK_MS = 5_000;
const FLUSH_MS = 120_000;
/** No input for this long and the time stops counting. */
const IDLE_MS = 90_000;
const NOTE_IDLE_MS = 5 * 60_000;

type NoteBuf = { s: number; p: number[]; t: number; at: number };
type DayBuf = { s: Partial<Record<Area, number>>; n?: Record<string, NoteBuf>; a: number; b: number };
type Buf = Record<string, DayBuf>;

let area: Area = "other";
let note: { id: string; page: number; total: number } | null = null;
let lastInput = Date.now();
let running = false;

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
    c.a = Math.min(c.a, d.a);
    c.b = Math.max(c.b, d.b);
  }
  write(cur);
}

function tick() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
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
  const buf = read();
  if (!Object.keys(buf).length) return;
  write({});
  try {
    const token = await getToken();
    if (!token) throw new Error("signed out");
    const res = await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ days: buf }),
      keepalive: closing,
    });
    if (!res.ok && res.status !== 400) throw new Error(String(res.status));
  } catch {
    mergeBack(buf);
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
  const t = window.setInterval(tick, TICK_MS);
  const f = window.setInterval(() => void flush(getToken), FLUSH_MS);
  // Anything left from last time (closed app, no signal) goes now.
  const first = window.setTimeout(() => void flush(getToken), 4_000);
  return () => {
    running = false;
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel", "scroll"]) window.removeEventListener(ev, onInput, opts);
    window.removeEventListener("pointermove", onMove, opts);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onVis);
    window.clearInterval(t);
    window.clearInterval(f);
    window.clearTimeout(first);
  };
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
