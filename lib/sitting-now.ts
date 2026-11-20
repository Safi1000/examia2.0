"use client";

import { useEffect, useState } from "react";
import type { Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { extensionFor } from "@/lib/data/selectors";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";

/** A sitting counts as live this long past its writing and upload time (a slow hand in, a late photo). */
const GRACE_MS = 5 * 60_000;

type Start = { testId: string; studentId: string; at: number };

/**
 * Students sitting these tests right now: started, not handed in, and still
 * inside their time. From the server's start times (test_attempts, which the
 * console may read) and, for a late window or the preview, from the "started"
 * entries in the feed. Read only while `active` (a confirmation is open).
 *
 * `loading` is true until the server has answered (at most 10 seconds).
 */
export function useSittingNow(db: Database, tests: Test[], active: boolean, nowMs: number): { loading: boolean; byTest: Map<string, string[]> } {
  const ids = tests.map((t) => t.id).sort().join(",");
  const [fetched, setFetched] = useState<{ ids: string; starts: Start[] } | null>(null);

  useEffect(() => {
    if (!active || !ids) return;
    let live = true;
    const done = (starts: Start[]) => {
      if (live) setFetched({ ids, starts });
    };
    if (DEMO) {
      void Promise.resolve().then(() => done([]));
      return;
    }
    const timer = setTimeout(() => done([]), 10_000);
    void Promise.resolve(supabase().from("test_attempts").select("test_id, student_id, started_at").in("test_id", ids.split(",")))
      .then(({ data }) => {
        clearTimeout(timer);
        done(((data as { test_id: string; student_id: string; started_at: string }[] | null) ?? []).map((r) => ({ testId: r.test_id, studentId: r.student_id, at: +new Date(r.started_at) })));
      })
      .catch(() => {
        clearTimeout(timer);
        done([]);
      });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, ids]);

  const byTest = new Map<string, string[]>();
  if (!active) return { loading: false, byTest };
  const starts: Start[] = [
    ...(fetched?.ids === ids ? fetched.starts : []),
    ...db.activities
      .filter((a) => a.type === "test_started" && a.testId && a.studentId)
      .map((a) => ({ testId: a.testId!, studentId: a.studentId!, at: +new Date(a.createdAt) })),
  ];
  for (const t of tests) {
    const limitMs = (t.durationMinutes + (t.uploadMinutes ?? 0)) * 60_000 + GRACE_MS;
    const who = new Set<string>();
    for (const s of starts) {
      if (s.testId !== t.id || who.has(s.studentId)) continue;
      if (db.submissions.some((x) => x.testId === t.id && x.studentId === s.studentId && x.status !== "in_progress")) continue;
      // Still open for them: the test itself, or their own late window.
      const ext = extensionFor(db, t.id, s.studentId);
      const closes = Math.max(+new Date(t.closesAt), ext ? +new Date(ext.until) : 0);
      if (nowMs >= closes + GRACE_MS || nowMs >= s.at + limitMs) continue;
      who.add(s.studentId);
    }
    if (who.size) byTest.set(t.id, [...who]);
  }
  return { loading: !DEMO && fetched?.ids !== ids, byTest };
}
