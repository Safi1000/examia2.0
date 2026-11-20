"use client";

import { useEffect, useRef } from "react";
import type { Answer } from "@/types";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { noteServerTime } from "@/lib/server-clock";
import { deviceId, token as signIn, within, type SittingDraft } from "@/lib/sitting";

const draftKey = (studentId: string, testId: string) => `examia.draft.${studentId}.${testId}`;

// Every queued save and every clear gets a number in order. A save queued
// before the draft was cleared (the paper was just handed in) is dropped, so a
// late flush can never bring back the draft of a test that is already in.
let seq = 0;
const clearedAt = new Map<string, number>();

type Job = { key: string; queued: number; draft: Omit<SittingDraft, "savedAt"> };

function write(job: Job) {
  if ((clearedAt.get(job.key) ?? 0) > job.queued) return;
  try {
    window.localStorage.setItem(job.key, JSON.stringify({ ...job.draft, savedAt: new Date().toISOString() }));
  } catch {
    /* ignore quota errors */
  }
}

export function loadDraft(studentId: string, testId: string): SittingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(studentId, testId));
    const d = raw ? (JSON.parse(raw) as SittingDraft) : null;
    return d && Array.isArray(d.answers) ? d : null;
  } catch {
    return null;
  }
}

/**
 * The server's copy of this student's answers for a test (or null: none,
 * offline, or the preview), and when Hamza last deleted their paper so it
 * can be sat again. `ok` is false when the server couldn't be asked at all.
 * The reply also sets the test clock (see lib/server-clock).
 */
type ServerCopy = { ok: boolean; draft: SittingDraft | null; resetAt: string | null };
export function loadServerCopy(testId: string, timeoutMs = 6_000): Promise<ServerCopy> {
  const none: ServerCopy = { ok: false, draft: null, resetAt: null };
  if (DEMO || typeof window === "undefined") return Promise.resolve(none);
  // A hard limit on the whole read, sign-in included (renewing an expired
  // sign-in has no time limit of its own).
  return within(readServerCopy(testId, timeoutMs), timeoutMs + 1_000, none);
}

async function readServerCopy(testId: string, timeoutMs: number): Promise<ServerCopy> {
  const none: ServerCopy = { ok: false, draft: null, resetAt: null };
  try {
    const t = await signIn();
    if (!t) return none;
    const sentAt = Date.now();
    const res = await fetch(`/api/test-draft?test=${encodeURIComponent(testId)}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return none;
    const j = (await res.json()) as { draft: SittingDraft | null; resetAt?: string | null; now?: number };
    if (typeof j.now === "number") noteServerTime(j.now, sentAt, Date.now());
    return {
      ok: true,
      draft: j.draft && Array.isArray(j.draft.answers) && typeof j.draft.startedAt === "string" ? j.draft : null,
      resetAt: typeof j.resetAt === "string" ? j.resetAt : null,
    };
  } catch {
    return none;
  }
}

/**
 * Sends one copy to the server straight away (not the debounced autosave):
 * answers on this phone that didn't make it into the paper that was kept,
 * so they are still on the server for Hamza.
 */
export async function sendServerCopy(draft: Omit<SittingDraft, "savedAt">): Promise<void> {
  if (DEMO || typeof window === "undefined") return;
  try {
    const t = await signIn();
    if (!t) return;
    await fetch("/api/test-draft", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(draft),
    });
  } catch {
    /* still on this phone */
  }
}

export function clearDraft(studentId: string, testId: string) {
  if (typeof window === "undefined") return;
  const key = draftKey(studentId, testId);
  clearedAt.set(key, ++seq);
  window.localStorage.removeItem(key);
}

/**
 * Debounced autosave of the in-progress test. Survives refresh; the runner
 * rehydrates from loadDraft() on mount.
 *
 * The last change is never left waiting on the debounce: it is written at once
 * when the page goes away (Back, tab closed, app switched, phone locked).
 *
 * A copy also goes to the server (every few seconds while they work, and as
 * the page goes away), so a phone that dies or a switch of device keeps the
 * answers too. See loadServerCopy and /api/test-draft.
 *
 * `sitting` and `edits` go along with the answers: which sitting the copy
 * belongs to (see lib/sitting.ts), and when each answer was last changed, so
 * copies from two devices can be joined question by question.
 */
export function useDraftAutosave(params: {
  studentId: string;
  testId: string;
  answers: Answer[];
  currentIndex: number;
  startedAt: string;
  sitting?: string | null;
  edits?: Record<string, number>;
  by?: Record<string, string>;
  /**
   * False until the server's copy has been read (or there is none). Until
   * then each copy is still sent, but marked "only if empty": the server
   * writes it only when its copy holds nothing from another device, so a
   * blank sheet on a phone that couldn't read the server never overwrites
   * answers saved there, and a phone that dies still leaves its answers.
   */
  serverReady?: boolean;
  enabled: boolean;
}) {
  const { studentId, testId, answers, currentIndex, startedAt, sitting = null, edits, by, serverReady = true, enabled } = params;
  const readyRef = useRef(serverReady);
  // The server said it holds another device's answers: wait for a read.
  const refused = useRef(false);
  useEffect(() => {
    readyRef.current = serverReady;
    if (serverReady) refused.current = false;
  }, [serverReady]);
  const pending = useRef<Job | null>(null);
  // The server copy: the newest draft waiting to go, the sign-in to send it with, and when it last went.
  const toServer = useRef<Job | null>(null);
  const token = useRef<string | null>(null);
  const sentAt = useRef(0);

  useEffect(() => {
    if (DEMO) return;
    let live = true;
    const read = () =>
      void supabase()
        .auth.getSession()
        .then(({ data }) => {
          if (live) token.current = data.session?.access_token ?? null;
        });
    read();
    const t = window.setInterval(read, 5 * 60_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  // Every 8 seconds at most, and only when something changed. `keepalive` lets the last one finish as the page closes.
  useEffect(() => {
    if (DEMO) return;
    const send = (closing = false) => {
      const job = toServer.current;
      if (!job || !token.current || (!readyRef.current && refused.current) || (clearedAt.get(job.key) ?? 0) > job.queued) return;
      if (!closing && Date.now() - sentAt.current < 8_000) return;
      toServer.current = null;
      sentAt.current = Date.now();
      void fetch("/api/test-draft", {
        method: "POST",
        keepalive: closing,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` },
        body: JSON.stringify(readyRef.current ? job.draft : { ...job.draft, ifEmpty: true, device: deviceId() }),
      })
        .then((r) => {
          if (r.status === 409) refused.current = true;
          // Not saved: try again with the next change (or the next tick).
          if (!r.ok && !toServer.current) toServer.current = job;
        })
        .catch(() => {
          if (!toServer.current) toServer.current = job;
        });
    };
    const tick = window.setInterval(() => send(), 4_000);
    const bye = () => send(true);
    const onHide = () => document.visibilityState === "hidden" && send(true);
    window.addEventListener("pagehide", bye);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("pagehide", bye);
      document.removeEventListener("visibilitychange", onHide);
      send(true);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Saving just stopped (time up, handed in): keep the change that was waiting.
      const job = pending.current;
      pending.current = null;
      if (job) write(job);
      return;
    }
    const job: Job = {
      key: draftKey(studentId, testId),
      queued: ++seq,
      draft: { testId, studentId, answers, currentIndex, startedAt, sitting, edits, by },
    };
    pending.current = job;
    toServer.current = job;
    const timer = window.setTimeout(() => {
      if (pending.current !== job) return;
      pending.current = null;
      write(job);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [studentId, testId, answers, currentIndex, startedAt, sitting, edits, by, enabled]);

  useEffect(() => {
    const flush = () => {
      const job = pending.current;
      pending.current = null;
      if (job) write(job);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      // Leaving the runner (Back, a link): write what was still waiting.
      flush();
    };
  }, []);
}
