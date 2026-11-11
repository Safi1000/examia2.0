"use client";

import { useSyncExternalStore } from "react";

/**
 * What a student has done in the past paper library, kept on their own device
 * only (nothing is sent anywhere): papers they finished with their mark, the
 * last papers they opened, multiple choice questions they have seen, and the
 * ones they got wrong (their mistakes list). Browser storage can be blocked
 * (private mode), so every read and write is guarded and the pages still work.
 */
export interface DoneEntry {
  /** Raw mark, if they entered or got one. */
  s: number | null;
  /** Out of. */
  m: number | null;
  /** Grade on this paper from Cambridge's thresholds, if known. */
  g: string | null;
  at: number;
}
export interface RecentEntry {
  u: string;
  c: string;
  l: string;
  at: number;
}
export interface Store {
  done: Record<string, DoneEntry>;
  recent: RecentEntry[];
  /** Question id ("2281_s25_12#5") → when it was last answered. */
  seen: Record<string, number>;
  /** Question id → when they last got it wrong. Cleared when they get it right. */
  wrong: Record<string, number>;
}

const KEY = "ht-past-papers";
const EMPTY: Store = { done: {}, recent: [], seen: {}, wrong: {} };
const listeners = new Set<() => void>();
let cache: Store | null = null;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Keeps only entries in the shape the pages expect. Older versions of the site,
 * a half-written save or a hand-edited value must not crash the progress page
 * or show "NaN%": anything malformed is dropped, the rest is kept.
 */
function clean(v: unknown): Store {
  if (!isObj(v)) return EMPTY;
  const done: Record<string, DoneEntry> = {};
  if (isObj(v.done))
    for (const [k, d] of Object.entries(v.done)) {
      if (d === true) done[k] = { s: null, m: null, g: null, at: 0 };
      else if (isObj(d)) {
        const s = num(d.s);
        const m = num(d.m);
        done[k] = { s: s != null && s >= 0 ? s : null, m: m != null && m > 0 ? m : null, g: typeof d.g === "string" && d.g ? d.g : null, at: num(d.at) ?? 0 };
      }
    }
  const recent = (Array.isArray(v.recent) ? v.recent : [])
    .filter((r): r is RecentEntry => isObj(r) && typeof r.u === "string" && r.u.startsWith("/past-papers/") && typeof r.c === "string")
    .map((r) => ({ u: r.u, c: r.c, l: typeof r.l === "string" ? r.l : "", at: num(r.at) ?? 0 }))
    .filter((r, i, a) => a.findIndex((x) => x.u === r.u) === i)
    .slice(0, 6);
  const times = (o: unknown) => {
    const out: Record<string, number> = {};
    if (isObj(o)) for (const [k, t] of Object.entries(o)) if (num(t) != null) out[k] = t as number;
    return out;
  };
  return { done, recent, seen: times(v.seen), wrong: times(v.wrong) };
}

function load(): Store {
  if (cache) return cache;
  try {
    cache = clean(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function save(next: Store) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
};

/** The student's progress. Empty on the server and on first paint. */
export function useProgress(): Store {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

export function markDone(key: string, entry: Omit<DoneEntry, "at">) {
  const s = load();
  save({ ...s, done: { ...s.done, [key]: { ...entry, at: Date.now() } } });
}

export function unmarkDone(key: string) {
  const s = load();
  const done = { ...s.done };
  delete done[key];
  save({ ...s, done });
}

export function addRecent(r: Omit<RecentEntry, "at">) {
  const s = load();
  const recent = [{ ...r, at: Date.now() }, ...s.recent.filter((x) => x.u !== r.u)].slice(0, 6);
  save({ ...s, recent });
}

/** Record answers to multiple choice questions: right ones leave the mistakes list, wrong ones join it. */
export function recordAnswers(results: Array<{ id: string; right: boolean }>) {
  if (!results.length) return;
  const s = load();
  const now = Date.now();
  const seen = { ...s.seen };
  const wrong = { ...s.wrong };
  for (const r of results) {
    seen[r.id] = now;
    if (r.right) delete wrong[r.id];
    else wrong[r.id] = now;
  }
  save({ ...s, seen, wrong });
}

/** Night reading: paper pages shown light-on-dark. A per-device choice. */
const NIGHT = "ht-pp-night";
const nightListeners = new Set<() => void>();
const readNight = () => {
  try {
    return localStorage.getItem(NIGHT) === "1";
  } catch {
    return false;
  }
};
export function useNight(): [boolean, () => void] {
  const on = useSyncExternalStore(
    (l) => {
      nightListeners.add(l);
      return () => nightListeners.delete(l);
    },
    readNight,
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(NIGHT, on ? "0" : "1");
    } catch {}
    nightListeners.forEach((l) => l());
  };
  return [on, toggle];
}
