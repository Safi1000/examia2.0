"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { addDays, pkDate } from "@/lib/timetable";
import type { Database } from "@/lib/data/seed";
import { TRACKING_SINCE, type Area, type DayActivity, type NoteActivity, type StudentActivity } from "@/lib/activity";

export type ActivityState = { data: Record<string, StudentActivity> | null; error: boolean; reload: () => void };

/**
 * Admin: every student's activity since `from` (or one student's). Each
 * student's `focusHomework` (assignment id to Groundwork seconds, this month
 * and last) comes with it, whatever `from` is.
 */
export function useActivity(from: string, db: Database, studentId?: string): ActivityState {
  const [data, setData] = useState<Record<string, StudentActivity> | null>(null);
  const [error, setError] = useState(false);
  const [n, setN] = useState(0);
  const demo = useMemo(() => (DEMO ? demoActivity(db, from, studentId) : null), [db, from, studentId]);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    void (async () => {
      const { data: s } = await supabase().auth.getSession();
      const q = new URLSearchParams({ from });
      if (studentId) q.set("student", studentId);
      const res = await fetch(`/api/activity?${q}`, { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { students: Record<string, StudentActivity> };
      if (alive) {
        setData(body.students ?? {});
        setError(false);
      }
    })().catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [from, studentId, n]);
  return {
    data: demo ?? data,
    error: !demo && error,
    reload: () => {
      setError(false);
      setN((x) => x + 1);
    },
  };
}

/** Preview only: believable sample activity, the same every load. */
function demoActivity(db: Database, from: string, only?: string): Record<string, StudentActivity> {
  const today = pkDate(Date.now());
  const out: Record<string, StudentActivity> = {};
  const noteIds = db.notes.map((n) => n.id);
  db.students.forEach((st, i) => {
    if (only && st.id !== only) return;
    let seed = 7 + i * 131;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const keen = [0.9, 0.6, 0.35, 0.15, 0.75][i % 5];
    const quietFor = i % 5 === 3 ? 9 : 0;
    const days: Record<string, DayActivity> = {};
    const notes: Record<string, NoteActivity> = {};
    // Nothing before tracking began, as with real data, so the preview tells the truth about the counts.
    for (let d = from < TRACKING_SINCE ? TRACKING_SINCE : from; d <= today; d = addDays(d, 1)) {
      const back = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5);
      if (back < quietFor || rnd() > keen) continue;
      const s: Partial<Record<Area, number>> = {
        groundwork: Math.round(rnd() * 70 * 60),
        notes: Math.round(rnd() * 40 * 60),
        tests: rnd() > 0.7 ? Math.round(rnd() * 45 * 60) : 0,
        homework: Math.round(rnd() * 15 * 60),
        home: Math.round(rnd() * 5 * 60),
        plan: Math.round(rnd() * 4 * 60),
      };
      const at = Date.parse(`${d}T${String(16 + Math.floor(rnd() * 6)).padStart(2, "0")}:00:00+05:00`);
      days[d] = { s, a: at, b: at + 90 * 60_000 };
      if (noteIds.length && (s.notes ?? 0) > 300) {
        const id = noteIds[Math.floor(rnd() * noteIds.length)];
        const total = 12 + ((id.length * 7 + id.charCodeAt(id.length - 1)) % 20);
        const read = Array.from({ length: Math.ceil(rnd() * total) }, (_, k) => k + 1);
        const prev = notes[id];
        notes[id] = { s: (prev?.s ?? 0) + (s.notes ?? 0), p: Array.from(new Set([...(prev?.p ?? []), ...read])), t: total, at };
      }
    }
    const last = Object.values(days).reduce((m, v) => Math.max(m, v.b ?? 0), 0);
    // A quiet student last signed in before they went quiet (sign-ins predate activity tracking).
    const signIn = last || (quietFor ? Date.now() - quietFor * 864e5 : 0);
    // Groundwork time on their homework: keener students start more blocks from it. Its own seed, so the days above stay as they were.
    let hs = 11 + i * 977;
    const rnd2 = () => {
      hs = (hs * 9301 + 49297) % 233280;
      return hs / 233280;
    };
    const focusHomework: Record<string, number> = {};
    for (const a of db.assignments) {
      if (a.cohortId !== st.cohortId || (a.classId && !st.classIds.includes(a.classId)) || (a.subjectId && !st.subjectIds.includes(a.subjectId))) continue;
      if (rnd2() < keen) focusHomework[a.id] = Math.round(10 + rnd2() * 80) * 60;
    }
    out[st.id] = { days, notes, signIn: signIn ? new Date(signIn).toISOString() : null, ...(Object.keys(focusHomework).length ? { focusHomework } : {}) };
  });
  return out;
}
