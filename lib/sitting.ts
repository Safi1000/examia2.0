"use client";

import type { Answer, Draft } from "@/types";
import type { Database } from "@/lib/data/seed";
import { extensionFor } from "@/lib/data/selectors";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { noteServerTime } from "@/lib/server-clock";

/**
 * One "sitting" of a test: the normal one, or a fresh one after Hamza opened
 * a late window for the student or deleted their paper so they can sit it
 * again. A start time or saved copy from before the current sitting belongs
 * to the old one: it must never end the new one the moment it opens.
 */
export type Sitting = {
  /** The late window's or the deletion's time (ISO), or null for the normal sitting. */
  key: string | null;
  /** The same time in ms (0 for the normal sitting). */
  fromMs: number;
};

/** A saved copy, as the test screen writes it (older copies have no sitting or edits). */
export type SittingDraft = Draft & {
  sitting?: string | null;
  /** When each answer was last changed, by question id (server clock, ms). */
  edits?: Record<string, number>;
  /** Which device last changed each answer, by question id (see deviceId). */
  by?: Record<string, string>;
};

/** A random name for this browser, kept on it, so a copy can tell its own older saves from another device's. */
let device: string | null = null;
export function deviceId(): string {
  if (device) return device;
  try {
    device = window.localStorage.getItem("examia.device");
    if (!device) {
      device = Math.random().toString(36).slice(2, 12);
      window.localStorage.setItem("examia.device", device);
    }
  } catch {
    device ??= Math.random().toString(36).slice(2, 12);
  }
  return device;
}

/** The current sitting for this student and test. `resetAt` is when Hamza last deleted their paper, if ever. */
export function sittingFor(db: Database, testId: string, studentId: string, resetAt: string | null): Sitting {
  const ext = extensionFor(db, testId, studentId);
  const fromMs = Math.max(ext ? +new Date(ext.createdAt) || 0 : 0, resetAt ? +new Date(resetAt) || 0 : 0);
  // Kept as an ISO string to the millisecond, so every device reads the same key.
  return fromMs ? { key: new Date(fromMs).toISOString(), fromMs } : { key: null, fromMs: 0 };
}

/** True when a saved copy belongs to this sitting. */
export function inSitting(d: SittingDraft | null | undefined, s: Sitting): d is SittingDraft {
  if (!d) return false;
  if (!s.key) return true;
  if (d.sitting) return +new Date(d.sitting) === s.fromMs;
  // An older copy with no sitting on it counts only if it was started after.
  return +new Date(d.startedAt) >= s.fromMs;
}

export function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.type === "mcq") return typeof a.selectedIndex === "number";
  if (a.type === "text") return (a.text ?? "").trim().length > 0;
  return !!(a.photoUrls?.length || a.photoDataUrl);
}

const photosOf = (a: Answer) => a.photoUrls ?? (a.photoDataUrl ? [a.photoDataUrl] : []);

type Side = { answers: Answer[]; edits?: Record<string, number>; by?: Record<string, string> };

/**
 * Joins two copies of the same sitting (this device, and the server's copy
 * from another device), question by question: the newer typed answer or
 * choice wins, and photos from both are kept. A student typing on a laptop
 * and photographing their working on a phone loses neither.
 *
 * An answer this device itself saved last is never taken back from the
 * server (it is just an older copy of what is on screen), and neither is one
 * already joined in before (`seen`: question -> the other copy's change time),
 * so a page the student removed doesn't come back.
 */
export function joinAnswers(
  here: Side,
  there: Side,
  me: string,
  seen: Record<string, number> = {},
): { answers: Answer[]; edits: Record<string, number>; by: Record<string, string> } {
  const out = new Map(here.answers.map((a) => [a.questionId, a]));
  const edits: Record<string, number> = { ...(here.edits ?? {}) };
  const by: Record<string, string> = { ...(here.by ?? {}) };
  for (const b of there.answers) {
    const id = b.questionId;
    const a = out.get(id);
    const ta = here.edits?.[id] ?? 0;
    const tb = there.edits?.[id] ?? 0;
    // Our own older save, or a change already joined in: nothing new.
    if (a && (there.by?.[id] === me || (tb && tb <= (seen[id] ?? 0)))) continue;
    edits[id] = Math.max(ta, tb);
    if (tb > ta && there.by?.[id]) by[id] = there.by[id];
    if (!a) {
      out.set(id, b);
      continue;
    }
    // The question changed kind under one of them: keep this device's.
    if (a.type !== b.type) continue;
    if (a.type === "photo") {
      const pa = photosOf(a);
      const pb = photosOf(b);
      // This device changed it and so did the other one (or neither copy
      // says when): every page from both. Otherwise the side with the newer
      // change wins, so a page removed on one device stays removed.
      const both = (here.by?.[id] === me && ta > 0 && tb > 0) || (!ta && !tb);
      const next = both ? [...pa, ...pb.filter((u) => !pa.includes(u))].slice(0, 30) : tb > ta ? pb : pa;
      if (next !== pa) out.set(id, { ...a, photoUrls: next, photoDataUrl: next[0] });
      continue;
    }
    if (tb > ta || (!ta && !tb && !isAnswered(a) && isAnswered(b))) out.set(id, b);
  }
  return { answers: [...out.values()], edits, by };
}

/** The promise, or `fallback` once `ms` have passed. The work itself carries on. */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** Rejects with "timeout" once `ms` have passed. The work itself carries on. */
export function orTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * The sign-in to send. Reading it can renew an expired sign-in over the
 * network, which has no time limit of its own: 5 seconds at most here.
 */
export function token(): Promise<string | null> {
  return within(
    supabase()
      .auth.getSession()
      .then(({ data }) => data.session?.access_token ?? null),
    5_000,
    null,
  );
}

/** A fresh sitting's start, and any answers from the sitting before it (carried in, so nothing written is lost). */
export type Begun = { startedAt: string; carried: SittingDraft | null };

/**
 * Starts a fresh sitting on the server: the start time is the server's, and
 * a second device in the same sitting gets the same one. Null when it can't
 * be reached (the test screen then starts the clock itself).
 */
export function beginSitting(testId: string, key: string): Promise<Begun | null> {
  if (DEMO) return Promise.resolve(null);
  // Never longer than 12 seconds in all, sign-in included.
  return within(beginOnServer(testId, key), 12_000, null);
}

async function beginOnServer(testId: string, key: string): Promise<Begun | null> {
  try {
    const t = await token();
    if (!t) return null;
    const sentAt = Date.now();
    const res = await fetch("/api/test-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: "begin", testId, sitting: key }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { startedAt?: string; now?: number; carried?: SittingDraft | null };
    if (typeof j.now === "number") noteServerTime(j.now, sentAt, Date.now());
    if (typeof j.startedAt !== "string" || Number.isNaN(Date.parse(j.startedAt))) return null;
    const carried = j.carried && Array.isArray(j.carried.answers) && j.carried.answers.length ? j.carried : null;
    return { startedAt: j.startedAt, carried };
  } catch {
    return null;
  }
}

/** Owner only: after deleting a paper, the student's old start time and saved copy stop counting. */
export async function resetSitting(testId: string, studentId: string): Promise<void> {
  if (DEMO) return;
  try {
    const t = await token();
    if (!t) return;
    await fetch("/api/test-draft/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: "reset", testId, studentId }),
      keepalive: true,
    });
  } catch {
    /* the paper is still deleted; only the fresh clock is missed */
  }
}

/** Owner only: unsent answers saved on the server, for "Collect unsent answers". */
export async function unsentAnswers(
  action: "unsent" | "collect",
  testId: string,
  studentIds: string[],
): Promise<{ unsent?: { studentId: string; answered: number; savedAt: string }[]; collected?: string[]; failed?: string[]; error?: string }> {
  if (DEMO) return action === "unsent" ? { unsent: [] } : { collected: [], failed: [] };
  const t = await token();
  if (!t) return { error: "Sign in again, then try." };
  const res = await fetch("/api/test-draft/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify({ action, testId, studentIds }),
    cache: "no-store",
    signal: AbortSignal.timeout(action === "collect" ? 90_000 : 45_000),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { error: j.error ?? "That didn't work. Try again." };
  return j;
}
