"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClassItem, Student, SubjectItem } from "@/types";
import type { Database } from "@/lib/data/seed";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";

/**
 * Live classes. The weekly timetable is fixed and lives here (change a time
 * here, no database needed). Each day Hamza pastes a Meet link per class in
 * Admin → Classes; students see a Join button from 10 minutes before the start.
 * Join taps fill attendance automatically (see join_class() in the migration).
 */

export const TERM_STARTS = "2026-11-02";
/** Monday to Friday. */
export const CLASS_DAYS = [1, 2, 3, 4, 5];
/** How early the Join button wakes up. */
export const JOIN_EARLY_MIN = 10;

export type LevelKey = "A2" | "AS" | "O";
export type SubjectKey = "Economics" | "Business" | "Accounting";

export interface Slot {
  level: LevelKey;
  subject: SubjectKey;
  /** "HH:MM", Pakistan time. */
  start: string;
  end: string;
}

export const LEVEL_LABEL: Record<LevelKey, string> = { A2: "A2", AS: "AS", O: "IGCSE / O Level" };

export const TIMETABLE: Slot[] = [
  { level: "A2", subject: "Economics", start: "15:30", end: "16:10" },
  { level: "A2", subject: "Business", start: "16:10", end: "16:50" },
  { level: "A2", subject: "Accounting", start: "16:50", end: "17:30" },
  { level: "O", subject: "Economics", start: "17:30", end: "18:10" },
  { level: "O", subject: "Business", start: "18:10", end: "18:50" },
  { level: "O", subject: "Accounting", start: "18:50", end: "19:30" },
  { level: "AS", subject: "Accounting", start: "19:30", end: "20:10" },
  { level: "AS", subject: "Business", start: "20:10", end: "20:50" },
  { level: "AS", subject: "Economics", start: "20:50", end: "21:30" },
];

/** Match the database class/subject rows to the timetable by name. */
export function levelOf(c: Pick<ClassItem, "name">): LevelKey | null {
  const n = c.name.toLowerCase();
  if (n.includes("a2")) return "A2";
  if (/\bas\b/.test(n)) return "AS";
  if (n.includes("igcse") || n.includes("o-level") || n.includes("o level")) return "O";
  return null;
}
export function subjectOf(s: Pick<SubjectItem, "name">): SubjectKey | null {
  const n = s.name.toLowerCase();
  if (n.startsWith("econ")) return "Economics";
  if (n.startsWith("bus")) return "Business";
  if (n.startsWith("acc")) return "Accounting";
  return null;
}

/** Today's date in Pakistan as YYYY-MM-DD. */
export const pkDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(ms);
export const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00+05:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return pkDate(+d);
};
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).getUTCDay();
export const isClassDay = (ymd: string) => ymd >= TERM_STARTS && CLASS_DAYS.includes(weekday(ymd));
/** Milliseconds for a Pakistan wall-clock time on a date. */
export const at = (ymd: string, hhmm: string) => +new Date(`${ymd}T${hhmm}:00+05:00`);
export const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};

export interface DaySlot extends Slot {
  date: string;
  classId: string;
  subjectId: string;
  startMs: number;
  endMs: number;
}

/** Every slot on a date, joined to the database ids (slots with no match are skipped). */
export function slotsOn(db: Pick<Database, "classes" | "subjects">, date: string): DaySlot[] {
  if (!isClassDay(date)) return [];
  const classId = new Map<LevelKey, string>();
  for (const c of db.classes) {
    const l = levelOf(c);
    if (l && !classId.has(l)) classId.set(l, c.id);
  }
  const subjectId = new Map<SubjectKey, string>();
  for (const s of db.subjects) {
    const k = subjectOf(s);
    if (k && !subjectId.has(k)) subjectId.set(k, s.id);
  }
  return TIMETABLE.flatMap((s) => {
    const c = classId.get(s.level);
    const sub = subjectId.get(s.subject);
    if (!c || !sub) return [];
    return [{ ...s, date, classId: c, subjectId: sub, startMs: at(date, s.start), endMs: at(date, s.end) }];
  });
}

/**
 * The slots a student sits: their own level and subjects, falling back to the
 * cohort's when the student has none set, and to all three subjects after that.
 */
export function slotsForStudent(db: Database, student: Student, date: string): DaySlot[] {
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const classes = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
  const subjects = student.subjectIds.length ? student.subjectIds : (cohort?.subjectIds ?? []);
  return slotsOn(db, date).filter((s) => classes.includes(s.classId) && (!subjects.length || subjects.includes(s.subjectId)));
}

export const slotKey = (s: { date: string; classId: string; subjectId: string }) => `${s.date}|${s.classId}|${s.subjectId}`;

export interface ClassLink {
  date: string;
  classId: string;
  subjectId: string;
  meetUrl: string | null;
  recordingUrl: string | null;
}
export interface ClassJoin {
  studentId: string;
  date: string;
  classId: string;
  subjectId: string;
  joinedAt: string;
}

// ---- Demo (preview only): kept in this browser ----------------------------
const DEMO_KEY = "ht_demo_class_links";
function demoLinks(): ClassLink[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]") as ClassLink[];
  } catch {
    return [];
  }
}

/**
 * Links (and, for Hamza, joins) between two dates. Refreshes every minute and
 * when the tab comes back. `ready` is false when the database update hasn't
 * been applied yet, so pages can say so instead of looking broken.
 */
export function useClassLinks(from: string, to: string, withJoins = false) {
  const [links, setLinks] = useState<ClassLink[]>([]);
  const [joins, setJoins] = useState<ClassJoin[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (DEMO) {
      setLinks(demoLinks().filter((l) => l.date >= from && l.date <= to));
      setReady(true);
      return;
    }
    const sb = supabase();
    const [l, j] = await Promise.all([
      sb.from("class_links").select("*").gte("on_date", from).lte("on_date", to),
      withJoins ? sb.from("class_joins").select("*").gte("on_date", from).lte("on_date", to) : Promise.resolve({ data: [], error: null }),
    ]);
    if (l.error) {
      setReady(false);
      return;
    }
    setReady(true);
    setLinks(
      (l.data ?? []).map((r) => ({
        date: r.on_date as string,
        classId: r.class_id as string,
        subjectId: r.subject_id as string,
        meetUrl: (r.meet_url as string) ?? null,
        recordingUrl: (r.recording_url as string) ?? null,
      })),
    );
    setJoins(
      ((j.data as Record<string, unknown>[]) ?? []).map((r) => ({
        studentId: r.student_id as string,
        date: r.on_date as string,
        classId: r.class_id as string,
        subjectId: r.subject_id as string,
        joinedAt: r.joined_at as string,
      })),
    );
  }, [from, to, withJoins]);

  useEffect(() => {
    // Initial fetch plus a gentle refresh; the effect owns the subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => void load(), 60_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  /** Hamza: save a Meet or recording link (blank clears it). */
  const save = useCallback(
    async (slots: Array<{ date: string; classId: string; subjectId: string }>, field: "meetUrl" | "recordingUrl", value: string | null) => {
      const v = value?.trim() || null;
      const next = (prev: ClassLink[]) => {
        const out = [...prev];
        for (const s of slots) {
          const i = out.findIndex((l) => slotKey(l) === slotKey(s));
          const base = i >= 0 ? out[i] : { ...s, meetUrl: null, recordingUrl: null };
          const row = { ...base, [field]: v };
          if (i >= 0) out[i] = row;
          else out.push(row);
        }
        return out;
      };
      setLinks(next);
      if (DEMO) {
        try {
          localStorage.setItem(DEMO_KEY, JSON.stringify(next(demoLinks())));
        } catch {}
        return true;
      }
      const col = field === "meetUrl" ? "meet_url" : "recording_url";
      const { error } = await supabase()
        .from("class_links")
        .upsert(
          slots.map((s) => ({ on_date: s.date, class_id: s.classId, subject_id: s.subjectId, [col]: v, updated_at: new Date().toISOString() })),
          { onConflict: "on_date,class_id,subject_id" },
        );
      if (error) {
        void load();
        return false;
      }
      return true;
    },
    [load],
  );

  return { links, joins, ready, save, reload: load };
}

/** Student taps Join: records attendance, then returns the Meet link to open. */
export async function joinClass(slot: DaySlot, fallbackUrl: string | null): Promise<string | null> {
  if (DEMO) return fallbackUrl;
  const { data, error } = await supabase().rpc("join_class", { p_class: slot.classId, p_subject: slot.subjectId });
  if (error) return fallbackUrl;
  return (data as string | null) ?? fallbackUrl;
}

/** Only links that are real Meet/Drive/https addresses get saved. */
export const looksLikeLink = (v: string) => /^https:\/\/\S+$/.test(v.trim());
