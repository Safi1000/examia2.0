"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useDatabase } from "@/lib/data/store";
import type { Database } from "@/lib/data/seed";
import { addDays, levelOf, pkDate, slotKey, subjectOf } from "@/lib/timetable";
import { CATCH_UP_HOURS, cleanAccess, noAccess, splitKey, viewOf, type AccessFile, type AccessView } from "@/lib/recording-access";

/**
 * The browser side of recordings beyond the last few days: every recording so
 * far (read in pages from class_links), and who may open what right now (from
 * app/api/recordings). In the demo everything is kept in this browser and no
 * server route is ever called.
 */

export interface RecordingRow {
  key: string;
  date: string;
  classId: string;
  subjectId: string;
  url: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

// ---- Demo (preview only) -------------------------------------------------------
const DEMO_LINKS = "ht_demo_class_links";
const DEMO_ACCESS = "ht_demo_recording_access";

/** Sample recordings for every weekday class of the last six weeks, plus any saved in the demo. */
function demoRows(db: Pick<Database, "classes" | "subjects">, nowMs: number): RecordingRow[] {
  const today = pkDate(nowMs);
  const out = new Map<string, RecordingRow>();
  const levels = db.classes.filter((c) => levelOf(c));
  const subjects = db.subjects.filter((s) => subjectOf(s));
  for (let back = 1; back <= 42; back++) {
    const date = addDays(today, -back);
    const wd = new Date(`${date}T12:00:00+05:00`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (const c of levels)
      for (const s of subjects) {
        const key = slotKey({ date, classId: c.id, subjectId: s.id });
        out.set(key, { key, date, classId: c.id, subjectId: s.id, url: `https://drive.google.com/file/d/demo-${date.replace(/-/g, "")}-${c.id}-${s.id}/view` });
      }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_LINKS) ?? "[]") as Array<{ date: string; classId: string; subjectId: string; recordingUrl: string | null }>;
    for (const l of saved) {
      const key = slotKey(l);
      if (l.recordingUrl) out.set(key, { key, date: l.date, classId: l.classId, subjectId: l.subjectId, url: l.recordingUrl });
      else out.delete(key);
    }
  } catch {}
  return [...out.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** The demo's saved state, or a sample catch-up window that is running. */
function demoAccess(nowMs: number): AccessFile {
  try {
    const raw = localStorage.getItem(DEMO_ACCESS);
    if (raw) return cleanAccess(JSON.parse(raw));
  } catch {}
  return {
    ...cleanAccess(null),
    catchUp: { startedAt: nowMs - 18 * 3_600_000, endsAt: nowMs + 30 * 3_600_000, upTo: pkDate(nowMs), total: 0, todo: [], failed: {} },
    refreshedAt: nowMs - 34 * 86_400_000,
  };
}
function saveDemoAccess(a: AccessFile) {
  try {
    localStorage.setItem(DEMO_ACCESS, JSON.stringify(a));
  } catch {}
}

// ---- Every recording so far ---------------------------------------------------

/**
 * Every class_links row that has a recording, newest first, read 1,000 at a
 * time. A student only gets rows for their own levels (the database allows
 * nothing else). `enabled` false skips the read.
 */
export function useRecordingRows(enabled = true) {
  const db = useDatabase();
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    if (DEMO) {
      setRows(demoRows(db, Date.now()));
      setReady(true);
      return;
    }
    const out: RecordingRow[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await supabase()
        .from("class_links")
        .select("on_date,class_id,subject_id,recording_url")
        .not("recording_url", "is", null)
        .order("on_date", { ascending: false })
        .order("class_id")
        .order("subject_id")
        .range(from, from + 999);
      if (error) {
        setReady(false);
        return;
      }
      for (const r of data ?? []) {
        const s = { date: r.on_date as string, classId: r.class_id as string, subjectId: r.subject_id as string };
        out.push({ key: slotKey(s), ...s, url: r.recording_url as string });
      }
      if ((data ?? []).length < 1000) break;
    }
    setRows(out);
    setReady(true);
  }, [enabled, db]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  return { rows, ready, reload: load };
}

// ---- Teacher: open and closed state, and the actions ----------------------------

export interface TeacherAccess {
  ready: boolean;
  google?: boolean;
  view: AccessView;
  catchUp: { startedAt: number; endsAt: number; upTo: string; total: number; waiting: number; failed: Array<{ key: string; why: string }> } | null;
  lastCatchUp: { startedAt: number; endsAt: number; opened: number; failed: number } | null;
  shared: string[];
  stuck: string[];
  refreshedAt: number | null;
}
export type TeacherResult = TeacherAccess & {
  closing?: number;
  closed?: boolean;
  refreshed?: number;
  skipped?: number;
  failed?: Array<{ key: string; why: string }>;
  left?: string[];
  error?: string;
};

function teacherOf(a: AccessFile, nowMs: number): TeacherAccess {
  const c = a.catchUp && a.catchUp.endsAt > nowMs ? a.catchUp : null;
  return {
    ready: true,
    google: true,
    view: viewOf(a, nowMs),
    catchUp: c ? { startedAt: c.startedAt, endsAt: c.endsAt, upTo: c.upTo, total: c.total, waiting: c.todo.length, failed: Object.entries(c.failed).map(([key, v]) => ({ key, why: v.why })) } : null,
    lastCatchUp: a.lastCatchUp ?? null,
    shared: Object.keys(a.shared),
    stuck: [],
    refreshedAt: a.refreshedAt,
  };
}

/** The demo's pretend server: same answers, nothing leaves the browser. */
function demoAct(action: string, body: { key?: string; keys?: string[] }, total: number): TeacherResult {
  const now = Date.now();
  const a = demoAccess(now);
  if (a.catchUp && a.catchUp.endsAt <= now) {
    a.lastCatchUp = { startedAt: a.catchUp.startedAt, endsAt: a.catchUp.endsAt, opened: a.catchUp.total, failed: 0 };
    a.catchUp = null;
  }
  const extra: Partial<TeacherResult> = {};
  if (action === "catchup-start" && !a.catchUp) {
    a.catchUp = { startedAt: now, endsAt: now + CATCH_UP_HOURS * 3_600_000, upTo: pkDate(now), total, todo: [], failed: {} };
    for (const [k, v] of Object.entries(a.overrides)) if (v === 0) delete a.overrides[k];
  }
  if (action === "catchup-close" && a.catchUp) {
    a.lastCatchUp = { startedAt: a.catchUp.startedAt, endsAt: now, opened: a.catchUp.total, failed: 0 };
    a.catchUp = null;
    extra.closing = 0;
  }
  if (action === "open" && body.key) a.overrides[body.key] = now + CATCH_UP_HOURS * 3_600_000;
  if (action === "close" && body.key) {
    a.overrides[body.key] = 0;
    extra.closed = true;
  }
  if (action === "refresh") {
    a.refreshedAt = now;
    Object.assign(extra, { refreshed: body.keys?.length ?? 0, skipped: 0, failed: [], left: [] });
  }
  saveDemoAccess(a);
  return { ...teacherOf(a, now), ...extra };
}

/** Hamza's Recordings page: the state, and `act` for every button (returns the server's answer). */
export function useTeacherAccess() {
  const [state, setState] = useState<TeacherAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (DEMO) {
      setState(teacherOf(demoAccess(Date.now()), Date.now()));
      return;
    }
    try {
      const res = await fetch("/api/recordings", { headers: await authHeader(), cache: "no-store" });
      const j = (await res.json()) as TeacherAccess & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load");
      setState(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  /** One button press. `total` is only used by the demo. */
  const act = useCallback(async (action: string, body: { key?: string; keys?: string[] } = {}, total = 0): Promise<TeacherResult> => {
    if (DEMO) {
      const r = demoAct(action, body, total);
      setState(r);
      return r;
    }
    try {
      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const j = (await res.json().catch(() => ({}))) as TeacherResult;
      if (!res.ok) return { ...(state ?? emptyTeacher), error: j.error ?? "Something went wrong. Try again." };
      setState(j);
      return j;
    } catch {
      return { ...(state ?? emptyTeacher), error: "No connection. Check the internet and try again." };
    }
  }, [state]);

  return { state, error, reload: load, act };
}

const emptyTeacher: TeacherAccess = { ready: false, view: noAccess, catchUp: null, lastCatchUp: null, shared: [], stuck: [], refreshedAt: null };

// ---- Student: is a window open for me? ------------------------------------------

/** The student's own part of the open and closed state (refreshed every few minutes). */
export function useStudentAccess(): AccessView {
  const [view, setView] = useState<AccessView>(noAccess);
  const load = useCallback(async () => {
    if (DEMO) {
      setView(viewOf(demoAccess(Date.now()), Date.now()));
      return;
    }
    try {
      const res = await fetch("/api/recordings/student", { headers: await authHeader(), cache: "no-store" });
      if (!res.ok) {
        setView(noAccess);
        return;
      }
      const j = (await res.json()) as AccessView;
      setView({ catchUpUntil: j.catchUpUntil ?? null, upTo: j.upTo ?? null, overrides: j.overrides ?? {}, hidden: j.hidden ?? [] });
    } catch {}
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);
  return view;
}

/** True when any window or single opening could show this student an older recording. */
export const anythingOpen = (v: AccessView, nowMs: number) =>
  (!!v.catchUpUntil && v.catchUpUntil > nowMs) || Object.values(v.overrides).some((t) => t > nowMs);

export { splitKey };
