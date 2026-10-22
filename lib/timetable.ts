import type { ClassItem, Student, SubjectItem } from "@/types";
import type { Database } from "@/lib/data/seed";

/**
 * The weekly timetable and date helpers (Pakistan time). Hamza edits the
 * schedule in Admin → Classes (saved on the server, see app/api/schedule);
 * DEFAULT_SCHEDULE is the starting point and the fallback. Pure, so both the
 * pages and the server (Google automation) use the same slots.
 */
/** Hour (Pakistan time) when the day's Meet links are made, before the first class at 3:30. */
export const LINKS_AT_HOUR = 13;
/** Students can watch a class recording until this many hours after the class ends. */
export const RECORDING_HOURS = 24;
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

/** A weekly class. `days` (0 = Sunday … 6) overrides the schedule's class days. */
export interface WeekSlot extends Slot {
  days?: number[];
}

/** A change for one date: cancel a class, move it, or add an extra one. */
export interface Exception {
  date: string;
  level: LevelKey;
  subject: SubjectKey;
  cancelled?: boolean;
  /** New times for this date (or the times of an extra class). */
  start?: string;
  end?: string;
  extra?: boolean;
}

export interface Schedule {
  termStarts: string;
  /** Class days, 0 = Sunday … 6 = Saturday. */
  days: number[];
  slots: WeekSlot[];
  exceptions: Exception[];
}

const TIMETABLE: WeekSlot[] = [
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

export const DEFAULT_SCHEDULE: Schedule = { termStarts: "2026-11-02", days: [1, 2, 3, 4, 5], slots: TIMETABLE, exceptions: [] };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LEVELS: LevelKey[] = ["A2", "AS", "O"];
const SUBJECTS: SubjectKey[] = ["Economics", "Business", "Accounting"];

/** A clean copy, or null if anything is malformed (so a bad save can't break the portal). */
export function cleanSchedule(v: unknown): Schedule | null {
  const x = v as Partial<Schedule> | null;
  if (!x || typeof x.termStarts !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.termStarts)) return null;
  if (!Array.isArray(x.days) || !Array.isArray(x.slots) || !Array.isArray(x.exceptions)) return null;
  const okSlot = (s: Partial<Slot>) => LEVELS.includes(s.level!) && SUBJECTS.includes(s.subject!) && HHMM.test(s.start ?? "") && HHMM.test(s.end ?? "") && s.start! < s.end!;
  const days = x.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const slots = x.slots.filter(okSlot).slice(0, 60).map((s) => ({
    level: s.level,
    subject: s.subject,
    start: s.start,
    end: s.end,
    ...(Array.isArray(s.days) ? { days: s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) } : {}),
  }));
  const exceptions = x.exceptions
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? "") && LEVELS.includes(e.level) && SUBJECTS.includes(e.subject))
    .filter((e) => e.cancelled || !e.start || (HHMM.test(e.start) && HHMM.test(e.end ?? "") && e.start < e.end!))
    .slice(-200)
    .map((e) => ({ date: e.date, level: e.level, subject: e.subject, ...(e.cancelled ? { cancelled: true } : {}), ...(e.start ? { start: e.start, end: e.end } : {}), ...(e.extra ? { extra: true } : {}) }));
  return { termStarts: x.termStarts, days, slots, exceptions };
}

// The schedule in use. Pages set it once fetched (ScheduleGate), the server per run.
// Pages that show classes subscribe (useSchedule in lib/classes.ts) and re-render.
let active: Schedule = DEFAULT_SCHEDULE;
let loaded = false;
const listeners = new Set<() => void>();
export const getSchedule = () => active;
/** True once the saved timetable has been fetched (so edits never start from the default by mistake). */
export const scheduleLoaded = () => loaded;
export function setSchedule(s: Schedule | null) {
  active = s ?? DEFAULT_SCHEDULE;
  loaded = true;
  listeners.forEach((l) => l());
}
export function subscribeSchedule(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** One change to one class on one date (null clears it). Applied on the server to the latest timetable. */
export interface DayChange {
  date: string;
  level: LevelKey;
  subject: SubjectKey;
  change: Omit<Exception, "date" | "level" | "subject"> | null;
}

/** Apply a one-day change, and drop changes older than a week (they no longer matter). */
export function applyDayChange(s: Schedule, c: DayChange, today: string): Schedule {
  const keep = s.exceptions.filter((e) => e.date >= addDays(today, -7) && !(e.date === c.date && e.level === c.level && e.subject === c.subject));
  return { ...s, exceptions: c.change ? [...keep, { date: c.date, level: c.level, subject: c.subject, ...c.change }] : keep };
}

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
/** Any class on this date (weekly ones from term start, or an extra one). */
export const isClassDay = (ymd: string) =>
  (ymd >= active.termStarts && active.slots.some((s) => (s.days ?? active.days).includes(weekday(ymd)))) ||
  active.exceptions.some((e) => e.date === ymd && e.extra && !e.cancelled);
/** Milliseconds for a Pakistan wall-clock time on a date. */
export const at = (ymd: string, hhmm: string) => +new Date(`${ymd}T${hhmm}:00+05:00`);
export const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
/** "15:30" → "3:30 PM". */
export const clock = (hhmm: string) => `${timeLabel(hhmm)} ${Number(hhmm.slice(0, 2)) < 12 ? "AM" : "PM"}`;
/** "3:30 to 4:10 PM", or "11:30 AM to 12:10 PM" when it crosses noon. */
export const span = (a: string, b: string) =>
  clock(a).slice(-2) === clock(b).slice(-2) ? `${timeLabel(a)} to ${clock(b)}` : `${clock(a)} to ${clock(b)}`;

export interface DaySlot extends Slot {
  date: string;
  /** Called off for this date (Hamza still sees it, students don't). */
  cancelled?: boolean;
  /** One-off: moved or extra for this date. */
  changed?: boolean;
  /** Not on the weekly timetable: added for this date only. */
  extra?: boolean;
  classId: string;
  subjectId: string;
  startMs: number;
  endMs: number;
}

/**
 * Every slot on a date, with that date's changes applied and joined to the
 * database ids (slots with no match are skipped). Cancelled classes are
 * included and flagged; use `liveSlotsOn` for what actually happens.
 */
export function slotsOn(db: Pick<Database, "classes" | "subjects">, date: string): DaySlot[] {
  const wd = weekday(date);
  const weekly: Array<Slot & { cancelled?: boolean; changed?: boolean; extra?: boolean }> =
    date >= active.termStarts ? active.slots.filter((s) => (s.days ?? active.days).includes(wd)).map((s) => ({ ...s })) : [];
  for (const e of active.exceptions.filter((x) => x.date === date)) {
    const i = weekly.findIndex((s) => s.level === e.level && s.subject === e.subject);
    if (e.extra) {
      if (i < 0 && e.start && e.end) weekly.push({ level: e.level, subject: e.subject, start: e.start, end: e.end, changed: true, extra: true, cancelled: e.cancelled });
      else if (i >= 0 && e.cancelled) weekly[i].cancelled = true;
      continue;
    }
    if (i < 0) continue;
    if (e.cancelled) weekly[i].cancelled = true;
    else if (e.start && e.end) weekly[i] = { ...weekly[i], start: e.start, end: e.end, changed: true };
  }
  if (!weekly.length) return [];
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
  return weekly
    .flatMap((s) => {
      const c = classId.get(s.level);
      const sub = subjectId.get(s.subject);
      if (!c || !sub) return [];
      return [{ ...s, date, classId: c, subjectId: sub, startMs: at(date, s.start), endMs: at(date, s.end) }];
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** Classes that are actually happening on a date. */
export const liveSlotsOn = (db: Pick<Database, "classes" | "subjects">, date: string) => slotsOn(db, date).filter((s) => !s.cancelled);

/**
 * The slots a student sits: their own level and subjects, falling back to the
 * cohort's when the student has none set, and to all three subjects after that.
 */
export function slotsForStudent(db: Database, student: Student, date: string): DaySlot[] {
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const classes = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
  const subjects = student.subjectIds.length ? student.subjectIds : (cohort?.subjectIds ?? []);
  return liveSlotsOn(db, date).filter((s) => classes.includes(s.classId) && (!subjects.length || subjects.includes(s.subjectId)));
}

export const slotKey = (s: { date: string; classId: string; subjectId: string }) => `${s.date}|${s.classId}|${s.subjectId}`;

/** Only links that are real https addresses get saved. */
export const looksLikeLink = (v: string) => /^https:\/\/\S+$/.test(v.trim());
