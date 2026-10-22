import type { ClassItem, Student, SubjectItem } from "@/types";
import type { Database } from "@/lib/data/seed";

/**
 * The fixed weekly timetable and date helpers (Pakistan time). Pure, so both
 * the pages and the server (Google automation) use the same slots. Change a
 * time here; no database needed.
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

/** Only links that are real https addresses get saved. */
export const looksLikeLink = (v: string) => /^https:\/\/\S+$/.test(v.trim());
