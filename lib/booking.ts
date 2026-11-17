/**
 * Free trial booking. The free trial is a seat in a real class, so the visitor
 * picks their subjects, level and a class day, and is shown that class's own
 * time from the timetable (lib/timetable.ts). There is no calendar backend:
 * the choice is typed into a WhatsApp message they send, and Hamza confirms it
 * in the chat, so nothing is reserved until then. One-off changes Hamza makes
 * in the portal (a cancelled or moved class) are not known here; he sorts
 * those out in the chat. Classes are online only (Google Meet or Zoom).
 */
import type { LevelName, SubjectName } from "@/lib/landing";
import { waTextLink } from "@/lib/landing";
import { DEFAULT_SCHEDULE, at, type LevelKey } from "@/lib/timetable";

export const TZ = "Asia/Karachi";

/** How far ahead visitors can pick, and the soonest (gives Hamza time to reply). */
export const DAYS_AHEAD = 14;
export const MIN_NOTICE_HOURS = 12;

const LEVEL_KEY: Record<LevelName, LevelKey> = { "O Level / IGCSE": "O", "AS Level": "AS", "A2 Level": "A2" };

/** One real class the visitor would sit in. Times are "HH:MM", Pakistan time. */
export interface TrialClass {
  subject: SubjectName;
  start: string;
  end: string;
}

/** The chosen subjects' classes for that level on a weekday (0 = Sunday), earliest first. */
export function trialClasses(level: LevelName, subjects: SubjectName[], weekday: number): TrialClass[] {
  return DEFAULT_SCHEDULE.slots
    .filter((s) => s.level === LEVEL_KEY[level] && subjects.includes(s.subject) && (s.days ?? DEFAULT_SCHEDULE.days).includes(weekday))
    .map((s) => ({ subject: s.subject, start: s.start, end: s.end }))
    .sort((x, y) => x.start.localeCompare(y.start));
}

/** True when the visitor's clock already reads Pakistan time. Client only. */
export function visitorInPakistanTime(): boolean {
  return new Date().getTimezoneOffset() === -300;
}

/** "18:50" as "6:50 pm". */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

/** A class time in the visitor's own time zone, e.g. "Thu 5:50 pm". Client only. */
export function localTimeLabel(day: Day, hhmm: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })
    .format(at(day.key, hhmm))
    .replace(/\s?(am|pm)$/i, (x) => ` ${x.trim().toLowerCase()}`);
}
export type Who = "Student" | "Parent";
export type Board = "Cambridge" | "Pearson Edexcel" | "Not sure";

export interface Day {
  /** yyyy-mm-dd in Pakistan time. */
  key: string;
  weekday: string;
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekdayIndex: number;
}

/** Pakistan-time parts of an instant. */
function pkParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    weekdayShort: get("weekday"),
  };
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * The class days a visitor can book from `now`: days the chosen classes run
 * (any class day until a level and subject are picked), not before term
 * starts, and with every chosen class still at least the notice period away.
 * Client only.
 */
export function upcomingDays(now: Date, level?: LevelName | null, subjects: SubjectName[] = []): Day[] {
  const days: Day[] = [];
  const earliest = now.getTime() + MIN_NOTICE_HOURS * 3600_000;
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const noonish = new Date(now.getTime() + i * 86400_000);
    const p = pkParts(noonish);
    const weekdayIndex = WEEKDAY_INDEX[p.weekdayShort];
    if (p.key < DEFAULT_SCHEDULE.termStarts) continue;
    const picked = level && subjects.length > 0;
    const starts = picked
      ? trialClasses(level, subjects, weekdayIndex).map((c) => c.start)
      : DEFAULT_SCHEDULE.slots.filter((s) => (s.days ?? DEFAULT_SCHEDULE.days).includes(weekdayIndex)).map((s) => s.start);
    // With a choice made, every chosen subject must have its class that day.
    if (!starts.length || (picked && starts.length < subjects.length)) continue;
    if (starts.some((t) => at(p.key, t) < earliest)) continue;
    days.push({
      key: p.key,
      weekday: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(noonish),
      date: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(noonish),
      weekdayIndex,
    });
  }
  return days;
}

/** "Accounting", "Accounting and Business", "Accounting, Business and Economics". */
export function joinSubjects(list: SubjectName[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function bookingLink(b: {
  subjects: SubjectName[];
  level: LevelName;
  day: Day;
  classes: TrialClass[];
  who: Who;
  board: Board;
}): string {
  const forWhom = b.who === "Parent" ? " for my child" : "";
  const abroad = !visitorInPakistanTime();
  const times = b.classes
    .map((c) => `${c.subject} at ${timeLabel(c.start)}${abroad ? ` (my time: ${localTimeLabel(b.day, c.start)})` : ""}`)
    .join(", ");
  const text =
    `Hi, I'd like to join a class as my free trial lesson${forWhom}: ${joinSubjects(b.subjects)} (${b.level}, ${
      b.board === "Not sure" ? "board not sure yet" : `${b.board} board`
    }).` + ` Class day: ${b.day.weekday} ${b.day.date}. ${times}, Pakistan time.`;
  return waTextLink(text);
}
