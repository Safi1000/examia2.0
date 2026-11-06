/**
 * Groundwork's "Today" plan: what is actually worth studying right now, from
 * the student's own portal (tests about to open or close, homework due, topics
 * due for review, their weakest topic), plus how much free time is left before
 * their next class. Pure: no network, no saving.
 */
import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import type { Profile } from "@/lib/profile";
import { dueFor } from "@/lib/due";
import { reviewQueue } from "@/lib/groundwork";
import { weakTopics } from "@/lib/performance";
import { slotsForStudent } from "@/lib/classes";
import { pkDate } from "@/lib/timetable";
import { todaysMission } from "@/components/student/StudyBuddy";

export type PlanKind = "test" | "homework" | "review" | "mission";

export interface PlanItem {
  key: string;
  kind: PlanKind;
  /** Short label above the title ("Test prep", "Homework"...). */
  tag: string;
  title: string;
  /** Why it is on the list, in a few words. */
  why: string;
  subject: string;
  /** Suggested minutes. */
  minutes: number;
  /** Homework opens its page; everything else starts a timed session. */
  href?: string;
  noteHref?: string;
}

const H = 3_600_000;
const rel = (ms: number) => {
  const h = Math.round(ms / H);
  if (ms < H) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.round(ms / (24 * H));
  return `${d} ${d === 1 ? "day" : "days"}`;
};

/** Up to four things, most urgent first. Nothing is invented: every item comes from the portal. */
export function planToday(db: Database, student: Student, profile: Profile, nowMs: number): PlanItem[] {
  const out: PlanItem[] = [];
  const due = dueFor(db, student, nowMs);

  // 1. A test opening in the next 2 days: revise its subject first.
  if (due.nextTest && +new Date(due.nextTest.opensAt) - nowMs < 48 * H) {
    const t = due.nextTest;
    out.push({
      key: `t-${t.id}`,
      kind: "test",
      tag: "Test prep",
      title: t.title,
      why: `Opens in ${rel(+new Date(t.opensAt) - nowMs)}`,
      subject: t.subject,
      minutes: 25,
    });
  }

  // 2. Homework: overdue first, then the next due within 3 days.
  const hw = [...due.overdue, ...due.dueSoon.filter((a) => +new Date(a.dueAt) - nowMs < 72 * H)].slice(0, 2);
  for (const a of hw) {
    const late = +new Date(a.dueAt) <= nowMs;
    const subject = db.subjects.find((s) => s.id === a.subjectId)?.name ?? "Homework";
    out.push({
      key: `h-${a.id}`,
      kind: "homework",
      tag: "Homework",
      title: a.title,
      why: late ? "Overdue: hand it in today" : `Due in ${rel(+new Date(a.dueAt) - nowMs)}`,
      subject,
      minutes: 40,
      href: `/assignments#a-${a.id}`,
    });
  }

  // 3. Topics due for review today (spaced: 1, 3, 7, 14 days).
  const weak = weakTopics(db, student);
  const reviews = reviewQueue(weak, profile.reviews, nowMs).filter((r) => r.isDue).slice(0, 2);
  for (const r of reviews) {
    const note = db.notes.find((n) => n.title.toLowerCase().includes(r.topic.toLowerCase()));
    out.push({
      key: `r-${r.key}`,
      kind: "review",
      tag: r.step === 0 ? "Fix a gap" : `Review ${r.step + 1} of 4`,
      title: r.topic,
      why: r.step === 0 ? "Came up weak in a test" : "Due today, so it sticks",
      subject: r.subject,
      minutes: 15,
      noteHref: note ? `/notes?open=${note.id}` : undefined,
    });
  }

  // 4. Nothing urgent: today's mission (weakest topic, or this week's plan).
  if (out.length < 2) {
    const m = todaysMission(db, student, nowMs);
    if (m && !out.some((x) => x.title.toLowerCase() === m.topic.toLowerCase()))
      out.push({ key: `m-${m.topic}`, kind: "mission", tag: "Today's mission", title: m.topic, why: "Your best next step", subject: m.subject, minutes: 25, noteHref: m.noteHref });
  }
  return out.slice(0, 4);
}

export interface FreeTime {
  /** Minutes free from now until the next class (or 10 pm). */
  minutes: number;
  /** What ends the window: "Accounting at 7:30" or "10 pm". */
  until: string;
  /** In a class right now. */
  inClass: boolean;
  /** Today's classes, for the day strip. */
  classes: Array<{ subject: string; startMs: number; endMs: number }>;
  dayStartMs: number;
  dayEndMs: number;
}

/** How much study time is left today before the next class, and the day's classes. */
export function freeTime(db: Database, student: Student, nowMs: number): FreeTime {
  const today = pkDate(nowMs);
  const slots = slotsForStudent(db, student, today);
  const dayStartMs = Date.parse(`${today}T08:00:00+05:00`);
  const dayEndMs = Date.parse(`${today}T22:00:00+05:00`);
  const inClass = slots.some((s) => nowMs >= s.startMs && nowMs < s.endMs);
  const next = slots.find((s) => s.startMs > nowMs);
  const end = next ? next.startMs : dayEndMs;
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).replace(":00", "").replace(" ", "");
  return {
    minutes: Math.max(0, Math.floor((end - nowMs) / 60_000)),
    until: next ? `${next.subject} at ${clock(next.startMs)}` : "10pm",
    inClass,
    classes: slots.map((s) => ({ subject: s.subject, startMs: s.startMs, endMs: s.endMs })),
    dayStartMs,
    dayEndMs,
  };
}

/** "1 h 40 min" */
export const fmtMin = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
