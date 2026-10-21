/**
 * Free trial booking. There is no calendar backend: the visitor picks a day and
 * a time here, and the choice is typed into a WhatsApp message they send.
 * Hamza confirms the slot in the chat, so nothing is reserved until then.
 * Classes are online only (Google Meet or Zoom).
 */
import type { LevelName, SubjectName } from "@/lib/landing";
import { waTextLink } from "@/lib/landing";

export const TZ = "Asia/Karachi";

/** 0 = Sunday … 6 = Saturday. */
export const TRIAL_DAYS = [1, 2, 3, 4, 5, 6];
/** Slot start times, 24-hour clock, Pakistan time: 1 pm to 8 pm (last slot ends 9 pm). Confirmed by Hamza. */
export const TRIAL_HOURS = [13, 14, 15, 16, 17, 18, 19, 20];
/** How far ahead visitors can pick, and the soonest (gives Hamza time to reply). */
export const DAYS_AHEAD = 14;
export const MIN_NOTICE_HOURS = 12;


/** The exact moment a slot starts (Pakistan is UTC+5, no daylight saving). */
export function slotInstant(day: Day, hour: number): Date {
  const [y, m, d] = day.key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 5));
}

/** True when the visitor's clock already reads Pakistan time. Client only. */
export function visitorInPakistanTime(): boolean {
  return new Date().getTimezoneOffset() === -300;
}

/** A slot in the visitor's own time zone, e.g. "Thu 12:00 pm". Client only. */
export function localSlotLabel(day: Day, hour: number): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })
    .format(slotInstant(day, hour))
    .replace(/\s?(am|pm)$/i, (x) => ` ${x.trim().toLowerCase()}`);
}
export type Who = "Student" | "Parent";
export type Board = "Cambridge" | "Pearson Edexcel" | "Not sure";

export interface Day {
  /** yyyy-mm-dd in Pakistan time. */
  key: string;
  weekday: string;
  date: string;
  hours: number[];
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

/** The bookable days from `now`, each with the hours still open. Client only. */
export function upcomingDays(now: Date): Day[] {
  const days: Day[] = [];
  const earliest = now.getTime() + MIN_NOTICE_HOURS * 3600_000;
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const noonish = new Date(now.getTime() + i * 86400_000);
    const p = pkParts(noonish);
    if (!TRIAL_DAYS.includes(WEEKDAY_INDEX[p.weekdayShort])) continue;
    const [y, m, d] = p.key.split("-").map(Number);
    // Pakistan is UTC+5 with no daylight saving.
    const hours = TRIAL_HOURS.filter((h) => Date.UTC(y, m - 1, d, h - 5) >= earliest);
    if (!hours.length) continue;
    days.push({
      key: p.key,
      weekday: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(noonish),
      date: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(noonish),
      hours,
    });
  }
  return days;
}

export function hourLabel(h: number): string {
  const suffix = h >= 12 ? "pm" : "am";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

/** "Accounting", "Accounting and Business", "Accounting, Business and Economics". */
export function joinSubjects(list: SubjectName[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export function bookingLink(b: {
  subjects: SubjectName[];
  level: LevelName;
  day: Day;
  hour: number;
  who: Who;
  board: Board;
}): string {
  const forWhom = b.who === "Parent" ? " for my child" : "";
  const local = visitorInPakistanTime() ? "" : ` (my time: ${localSlotLabel(b.day, b.hour)})`;
  const text =
    `Hi, I'd like to book the free trial lesson${forWhom} for ${joinSubjects(b.subjects)} (${b.level}, ${
      b.board === "Not sure" ? "board not sure yet" : `${b.board} board`
    }).` +
    ` Preferred time: ${b.day.weekday} ${b.day.date}, ${hourLabel(b.hour)} Pakistan time${local}.`;
  return waTextLink(text);
}
