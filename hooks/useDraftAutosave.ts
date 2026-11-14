"use client";

import { useEffect, useRef } from "react";
import type { Answer, Draft } from "@/types";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";

const draftKey = (studentId: string, testId: string) => `examia.draft.${studentId}.${testId}`;

// Every queued save and every clear gets a number in order. A save queued
// before the draft was cleared (the paper was just handed in) is dropped, so a
// late flush can never bring back the draft of a test that is already in.
let seq = 0;
const clearedAt = new Map<string, number>();

type Job = { key: string; queued: number; draft: Omit<Draft, "savedAt"> };

function write(job: Job) {
  if ((clearedAt.get(job.key) ?? 0) > job.queued) return;
  try {
    window.localStorage.setItem(job.key, JSON.stringify({ ...job.draft, savedAt: new Date().toISOString() }));
  } catch {
    /* ignore quota errors */
  }
}

export function loadDraft(studentId: string, testId: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(studentId, testId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** The server's copy of this student's answers for a test, or null (none, offline, or the preview). */
export async function loadServerDraft(testId: string): Promise<Draft | null> {
  if (DEMO || typeof window === "undefined") return null;
  try {
    const { data } = await supabase().auth.getSession();
    const t = data.session?.access_token;
    if (!t) return null;
    const ctl = new AbortController();
    const slow = setTimeout(() => ctl.abort(), 6_000);
    const res = await fetch(`/api/test-draft?test=${encodeURIComponent(testId)}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store", signal: ctl.signal });
    clearTimeout(slow);
    if (!res.ok) return null;
    const j = (await res.json()) as { draft: Draft | null };
    return j.draft && Array.isArray(j.draft.answers) ? j.draft : null;
  } catch {
    return null;
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
 * answers too. See loadServerDraft and /api/test-draft.
 */
export function useDraftAutosave(params: {
  studentId: string;
  testId: string;
  answers: Answer[];
  currentIndex: number;
  startedAt: string;
  enabled: boolean;
}) {
  const { studentId, testId, answers, currentIndex, startedAt, enabled } = params;
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
      if (!job || !token.current || (clearedAt.get(job.key) ?? 0) > job.queued) return;
      if (!closing && Date.now() - sentAt.current < 8_000) return;
      toServer.current = null;
      sentAt.current = Date.now();
      void fetch("/api/test-draft", {
        method: "POST",
        keepalive: closing,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` },
        body: JSON.stringify(job.draft),
      })
        .then((r) => {
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
      draft: { testId, studentId, answers, currentIndex, startedAt },
    };
    pending.current = job;
    toServer.current = job;
    const timer = window.setTimeout(() => {
      if (pending.current !== job) return;
      pending.current = null;
      write(job);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [studentId, testId, answers, currentIndex, startedAt, enabled]);

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
