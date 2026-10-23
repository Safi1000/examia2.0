/**
 * Class times for students in the Gulf. The timetable is kept in Pakistan
 * time (lib/timetable.ts); these offsets turn it into local time, so the
 * Gulf page stays in sync when the timetable changes. None of these
 * countries use daylight saving, and neither does Pakistan.
 */
import { DEFAULT_SCHEDULE, type LevelKey } from "@/lib/timetable";

export interface GulfZone {
  /** Countries that share this clock. */
  countries: string;
  /** Hours behind Pakistan (UTC+5). */
  behindPk: number;
}

export const GULF_ZONES: GulfZone[] = [
  { countries: "UAE and Oman", behindPk: 1 },
  { countries: "Saudi Arabia, Qatar, Kuwait and Bahrain", behindPk: 2 },
];

/** "15:30" moved back by n hours. */
export const shiftHours = (hhmm: string, n: number) => {
  const h = (Number(hhmm.slice(0, 2)) - n + 24) % 24;
  return `${String(h).padStart(2, "0")}${hhmm.slice(2)}`;
};

/** Each level's weekly block, first class start to last class end, in Pakistan time. */
export function levelBlocks() {
  const order: LevelKey[] = ["A2", "O", "AS"];
  return order.map((level) => {
    const slots = DEFAULT_SCHEDULE.slots.filter((s) => s.level === level).sort((a, b) => a.start.localeCompare(b.start));
    return { level, from: slots[0]?.start ?? "", to: slots[slots.length - 1]?.end ?? "", subjects: slots.map((s) => s.subject) };
  });
}
