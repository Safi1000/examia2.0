import type { Database } from "@/lib/data/seed";
import type { AttendanceStatus, Student } from "@/types";
import type { ClassJoin } from "@/lib/classes";
import { addDays, LEVEL_LABEL, pkDate, slotsForStudent } from "@/lib/timetable";
import { startedMs } from "@/lib/data/selectors";
import { inPersonIds } from "@/lib/in-person";

/**
 * Attendance per subject (Hamza, 27 Nov 2026: a student who comes to two of
 * their three subjects looked fine, because the register keeps one mark per
 * level and day). Worked out from the timetable and the Join taps, which are
 * per subject, so nothing new is stored.
 *
 * Due: a live class on that date, at the student's level, in a subject they
 * take at that level, that started after they started that level and subject,
 * has ended, and is not inside an "away until" spell Hamza set.
 * Every class that took place counts, also when nobody joined it (Hamza,
 * 28 Nov 2026: an empty class is everyone absent, and goes in the reminders).
 * A class that didn't happen is cancelled or marked "not held" on Classes,
 * which takes it off the timetable for that day, so it never counts.
 * Attended: a Join for that student, date, level and subject (late when it
 * came more than LATE_MINUTES after the start). Joined another subject at that
 * level that day but not this one: missed. No Join at all at that level that
 * day: the register decides (present or late by hand counts for every subject
 * that day, absent is a miss) and with no register row either the day is
 * unknown (a paused day: auto-absent writes a row for every real absence).
 *
 * In-person students never Join (their register is by hand per level): they
 * are left out, and so is everyone when the joins could not be read.
 */

/** Minutes after the start that still count as on time (the automatic register uses the same). */
export const LATE_MINUTES = 10;

export type ClassMark = "attended" | "late" | "missed";

export interface SubjectClass {
  date: string;
  classId: string;
  subjectId: string;
  /** "Economics". */
  subject: string;
  /** "AS", "A2", "IGCSE / O Level". */
  level: string;
  startMs: number;
  mark: ClassMark;
  /** Decided by Hamza's register mark, not a Join. */
  byHand: boolean;
}

/** A run of misses in one subject, ending at its latest class. */
export interface SubjectStreak {
  classId: string;
  subjectId: string;
  subject: string;
  level: string;
  /** The misses, newest first. */
  missed: SubjectClass[];
}

/** The latest "away until" Hamza set for each student: from the day it was set to the day given. */
export function awaySpells(db: Pick<Database, "remindersSent">): Map<string, { from: string; until: string }> {
  const best = new Map<string, { at: number; from: string; until: string }>();
  for (const r of db.remindersSent) {
    if (r.kind !== "away_until" || !/^\d{4}-\d{2}-\d{2}$/.test(r.ref)) continue;
    const at = +new Date(r.sentAt);
    if (!Number.isFinite(at)) continue;
    const had = best.get(r.studentId);
    if (!had || at > had.at) best.set(r.studentId, { at, from: pkDate(at), until: r.ref });
  }
  return new Map([...best].map(([id, v]) => [id, { from: v.from, until: v.until }]));
}

/**
 * Builds the lookups once, then lists any student's due classes between two
 * Pakistan dates (oldest first). `joinsOk` false: every list is empty, never
 * "missed" (a failed read is not "nobody joined").
 */
export function subjectAttendance(db: Database, input: { joins: ClassJoin[]; joinsOk: boolean; nowMs: number }) {
  const { joins, joinsOk, nowMs } = input;
  const inPerson = inPersonIds(db);
  const joinedSlot = new Map<string, number>();
  const joinedLevelDay = new Set<string>();
  for (const j of joins) {
    const k = `${j.studentId}|${j.date}|${j.classId}|${j.subjectId}`;
    const at = j.joinedAt ? Date.parse(j.joinedAt) : NaN;
    // A join with no time counts as on time.
    const ms = Number.isFinite(at) ? at : 0;
    joinedSlot.set(k, Math.min(joinedSlot.get(k) ?? Infinity, ms));
    joinedLevelDay.add(`${j.studentId}|${j.date}|${j.classId}`);
  }
  const marks = new Map<string, AttendanceStatus>();
  for (const a of db.attendanceDays) {
    marks.set(`${a.studentId}|${a.classId ?? ""}|${a.date}`, a.status);
  }
  const away = awaySpells(db);

  return function forStudent(student: Student, from: string, to: string): SubjectClass[] {
    if (!joinsOk || inPerson.has(student.id) || !from || !to) return [];
    const spell = away.get(student.id);
    const out: SubjectClass[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (spell && d >= spell.from && d <= spell.until) continue;
      for (const sl of slotsForStudent(db, student, d)) {
        // Still to come or still running: not counted yet.
        if (sl.endMs > nowMs) continue;
        if (startedMs(db, student, sl.classId, sl.subjectId) > sl.startMs) continue;
        const at = joinedSlot.get(`${student.id}|${d}|${sl.classId}|${sl.subjectId}`);
        let mark: ClassMark = "missed";
        let byHand = false;
        if (at !== undefined) mark = at > sl.startMs + LATE_MINUTES * 60_000 ? "late" : "attended";
        else if (!joinedLevelDay.has(`${student.id}|${d}|${sl.classId}`)) {
          const m = marks.get(`${student.id}|${sl.classId}|${d}`) ?? marks.get(`${student.id}||${d}`);
          // No Join and no register row: unknown (paused that day, say), never a miss.
          if (!m) continue;
          if (m === "present" || m === "late") {
            mark = m === "late" ? "late" : "attended";
            byHand = true;
          }
        }
        out.push({ date: d, classId: sl.classId, subjectId: sl.subjectId, subject: sl.subject, level: LEVEL_LABEL[sl.level], startMs: sl.startMs, mark, byHand });
      }
    }
    return out;
  };
}

/**
 * Each subject's misses in a row up to its latest class (only subjects whose
 * latest class was missed), longest run first. `after`: a run never reaches
 * back to or past this date (an "away until" spell ends it).
 */
export function missedStreaks(list: SubjectClass[], after = ""): SubjectStreak[] {
  const by = new Map<string, SubjectClass[]>();
  for (const c of list) by.set(`${c.classId}|${c.subjectId}`, [...(by.get(`${c.classId}|${c.subjectId}`) ?? []), c]);
  const out: SubjectStreak[] = [];
  for (const cs of by.values()) {
    const newest = [...cs].sort((a, b) => b.startMs - a.startMs);
    const missed: SubjectClass[] = [];
    for (const c of newest) {
      if (c.mark !== "missed" || (after && c.date <= after)) break;
      missed.push(c);
    }
    if (missed.length) out.push({ classId: newest[0].classId, subjectId: newest[0].subjectId, subject: newest[0].subject, level: newest[0].level, missed });
  }
  return out.sort((a, b) => b.missed.length - a.missed.length || b.missed[0].startMs - a.missed[0].startMs);
}

/**
 * How to name a subject for this student: "Economics", or with the level
 * ("AS Economics") when they take the same subject at two levels.
 */
export function subjectNamer(list: SubjectClass[]) {
  const levels = new Map<string, Set<string>>();
  for (const c of list) levels.set(c.subject, (levels.get(c.subject) ?? new Set()).add(c.classId));
  return (c: Pick<SubjectClass, "subject" | "level">) => ((levels.get(c.subject)?.size ?? 0) > 1 ? `${c.level} ${c.subject}` : c.subject);
}

/**
 * Subjects whose latest class the student was in (for "they've been coming to
 * accounting fine"), named as `subjectNamer` does, never one of `missed` (names).
 */
export function attendingSubjects(list: SubjectClass[], missed: string[] = []): string[] {
  const name = subjectNamer(list);
  const latest = new Map<string, SubjectClass>();
  for (const c of list) {
    const k = `${c.classId}|${c.subjectId}`;
    if (!latest.has(k) || c.startMs > latest.get(k)!.startMs) latest.set(k, c);
  }
  return [...new Set([...latest.values()].filter((c) => c.mark !== "missed").map(name))].filter((n) => !missed.includes(n));
}

/** Per subject over a window: how many were due, attended (late included) and missed, with the missed days. */
export function subjectSummary(list: SubjectClass[]) {
  const by = new Map<string, { subject: string; level: string; due: number; came: number; late: number; missed: SubjectClass[] }>();
  for (const c of list) {
    const k = `${c.classId}|${c.subjectId}`;
    const row = by.get(k) ?? { subject: c.subject, level: c.level, due: 0, came: 0, late: 0, missed: [] };
    row.due++;
    if (c.mark === "missed") row.missed.push(c);
    else row.came++;
    if (c.mark === "late") row.late++;
    by.set(k, row);
  }
  return [...by.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.level.localeCompare(b.level) || a.subject.localeCompare(b.subject));
}

/** "tue 18" style day, Pakistan time (lower case for messages comes from the caller). */
export const classDay = (c: Pick<SubjectClass, "startMs">) =>
  new Date(c.startMs).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "Asia/Karachi" });
