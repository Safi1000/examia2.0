"use client";

import { useEffect, useRef } from "react";
import type { Answer, Draft } from "@/types";

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
 * TODO(rls): persist drafts to the backend so they survive device changes.
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
