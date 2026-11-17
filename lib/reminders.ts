import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { absenceStreak, archivedCohortIds, countedDays, extensionFor, isArchivedTest, liveStatus, startedMs, testCoversStudent } from "@/lib/data/selectors";
import { displayName, isTestAccount } from "@/lib/display-name";
import { isPausedId } from "@/lib/paused";
import { parentAbsent, parentLowScore, parentMissedTest, parentReport } from "@/lib/portal-messages";
import { inPersonIds } from "@/lib/in-person";
import { awardedMarks, isFullyGraded, percent, totalMarks } from "@/lib/scoring";
import { pkDate } from "@/lib/timetable";

/** Results under this percentage are worth a word with the parents. */
export const LOW_SCORE = 70;

/**
 * What the admin still has to chase.
 *
 * Nothing is scheduled or stored: the list is derived from the data every time
 * the panel renders, minus whatever has already been sent. Everything on it
 * closes itself (see the numbers above dueReminders), and a student appears
 * at most once. Adding a new kind of
 * reminder means adding one entry to KINDS and one branch in `dueReminders` —
 * the panel, the dedupe and the send button need no changes.
 */

export type ReminderKind = "missed_test" | "absent_streak" | "low_score" | "report_due";

export interface Reminder {
  kind: ReminderKind;
  student: Student;
  /** What this reminder is about — test id, date, or month. Dedupe key. */
  ref: string;
  /** One line for the panel. */
  label: string;
  /** The WhatsApp message, ready to send. */
  message: string;
}

export const KINDS: Record<ReminderKind, { label: string; tone: "warning" | "error" | "brand" }> = {
  missed_test: { label: "Skipped a test", tone: "warning" },
  absent_streak: { label: "Absent 2+ days", tone: "error" },
  low_score: { label: "Low result", tone: "warning" },
  report_due: { label: "Report to send", tone: "brand" },
};

const monthName = (month: string) => {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
};

/*
 * How the list stays short (Hamza, 18 Nov 2026: the reminders were getting out
 * of hand; they should close themselves, and only the ones parents will value
 * should show). Change a number here and the whole list follows.
 */
/** A missed test, a low result or an absence closes itself this many days after it happened. */
export const CLOSES_AFTER_DAYS = 7;
/** Last month's report can be sent until this day of the month, then it closes itself. */
export const REPORT_UNTIL_DAY = 14;
/** One result under this is worth a word on its own. Between this and LOW_SCORE, only a second low result in a month is. */
export const SERIOUS_SCORE = 50;
/** After one message to a parent, nothing else about that student for this many days (the monthly report aside). */
export const COOL_OFF_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;
/** Most important first: only one of these is shown for a student at a time. */
const PRIORITY: ReminderKind[] = ["absent_streak", "missed_test", "low_score"];

export function dueReminders(db: Database, nowMs: number, cohortId: string | null): Reminder[] {
  const sent = new Set(db.remindersSent.map((r) => `${r.studentId}|${r.kind}|${r.ref}`));
  // Past students (switched-off cohorts) are never chased.
  const off = archivedCohortIds(db);
  // In-person students are managed in class: no parent messages or monthly reports from here.
  // Hamza's own test account is never chased either.
  const inPerson = inPersonIds(db);
  const students = db.students.filter((s) => !off.has(s.cohortId) && !inPerson.has(s.id) && !isTestAccount(s) && !isPausedId(s.id) && (cohortId ? s.cohortId === cohortId : true));
  const fresh = (r: Reminder) => !sent.has(`${r.student.id}|${r.kind}|${r.ref}`);
  const OPEN = CLOSES_AFTER_DAYS * DAY;

  // A parent who heard from Hamza in the last week is left alone: one message, then quiet.
  const told = new Set(
    db.remindersSent
      .filter((r) => PRIORITY.includes(r.kind as ReminderKind) && nowMs - new Date(r.sentAt).getTime() <= COOL_OFF_DAYS * DAY)
      .map((r) => r.studentId),
  );
  // At most one reminder per student from the three below, the most important one.
  const one = new Map<string, Reminder>();
  const offer = (r: Reminder) => {
    if (!fresh(r) || told.has(r.student.id)) return;
    const had = one.get(r.student.id);
    if (!had || PRIORITY.indexOf(r.kind) < PRIORITY.indexOf(had.kind)) one.set(r.student.id, r);
  };

  // 1. Absent two or more classes in a row, and still current: the latest absence is within the week.
  for (const student of students) {
    const streak = absenceStreak(db, student.id);
    if (streak < 2) continue;
    // Only days from joining on count (a wrong old mark never reaches a parent).
    const last = countedDays(db, student.id)
      .filter((a) => a.status === "absent")
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last && nowMs - new Date(`${last.date}T12:00:00+05:00`).getTime() > OPEN) continue;
    offer({
      kind: "absent_streak",
      student,
      ref: last?.date ?? String(streak),
      label: `${displayName(student.username)} has been absent ${streak} classes in a row`,
      message: parentAbsent({ id: student.id, username: student.username, streak }),
    });
  }

  // 2. A test that closed in the last week with nothing handed in. One per
  // student (the latest), however many they missed. A student who joined after
  // the test opened owes nothing for it.
  const closed = db.tests
    .filter((t) => liveStatus(t, nowMs) === "closed" && nowMs - new Date(t.closesAt).getTime() <= OPEN && !isArchivedTest(db, t, off))
    .sort((a, b) => b.closesAt.localeCompare(a.closesAt));
  // Looked up once: scanning every submission for every student and test is slow with a full roster.
  const started = closed.length ? new Set(db.submissions.map((s) => `${s.testId}|${s.studentId}`)) : new Set<string>();
  for (const student of students) {
    const missed = closed.filter((test) => {
      if (!testCoversStudent(test, student)) return false;
      // Joined, or started this test's subject or level, after it opened: it was not theirs to miss.
      if (startedMs(db, student, test.classId, test.subjectId) > new Date(test.opensAt).getTime()) return false;
      if (started.has(`${test.id}|${student.id}`)) return false;
      // Reopened just for them and still open: not missed (yet).
      const ext = extensionFor(db, test.id, student.id);
      return !(ext && +new Date(ext.until) > nowMs);
    });
    const test = missed[0];
    if (!test) continue;
    offer({
      kind: "missed_test",
      student,
      ref: test.id,
      label: `${displayName(student.username)} did not sit "${test.title}"${missed.length > 1 ? ` (and ${missed.length - 1} more this week)` : ""}`,
      message: parentMissedTest({ id: student.id, username: student.username, title: test.title, subject: test.subject }),
    });
  }

  // 3. A low result released in the last week: under 50% on its own, or the
  // second result under 70% within a month. A single 60-something is not a
  // message to a parent.
  const byId = new Map(students.map((s) => [s.id, s]));
  const low = new Map<string, Array<{ subId: string; pct: number; at: number; title: string; subject: string }>>();
  for (const sub of db.submissions) {
    if (sub.status !== "released" || !sub.releasedAt) continue;
    const at = new Date(sub.releasedAt).getTime();
    if (nowMs - at > 30 * DAY) continue;
    const student = byId.get(sub.studentId);
    const test = db.tests.find((t) => t.id === sub.testId);
    if (!student || !test || isArchivedTest(db, test, off)) continue;
    const total = totalMarks(test);
    // Only results that are fully marked: an unmarked answer would count as zero.
    if (!total || !isFullyGraded(test, sub)) continue;
    const pct = percent(awardedMarks(sub), total);
    // Judged on the rounded figure the label shows, so "scored 70%" never sits under a low result.
    if (Math.round(pct) >= LOW_SCORE) continue;
    low.set(student.id, [...(low.get(student.id) ?? []), { subId: sub.id, pct, at, title: test.title, subject: test.subject }]);
  }
  for (const [studentId, list] of low) {
    const student = byId.get(studentId)!;
    const latest = list.sort((a, b) => b.at - a.at)[0];
    if (nowMs - latest.at > OPEN) continue;
    const serious = Math.round(latest.pct) < SERIOUS_SCORE;
    if (!serious && list.length < 2) continue;
    offer({
      kind: "low_score",
      student,
      ref: latest.subId,
      label: `${displayName(student.username)} scored ${Math.round(latest.pct)}% in "${latest.title}"${serious ? "" : `, ${list.length === 2 ? "the second" : `number ${list.length}`} low result this month`}`,
      message: parentLowScore({ id: student.id, username: student.username, pct: latest.pct, title: latest.title, subject: latest.subject }),
    });
  }

  const out: Reminder[] = [...one.values()].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));

  // 4. Last month's report, from the 1st to the 14th, then it closes itself. The
  // month turns over at midnight in Pakistan, whatever time zone the laptop or tablet is set to.
  const [pkYear, pkMonth, pkDay] = pkDate(nowMs).split("-").map(Number);
  if (pkDay > REPORT_UNTIL_DAY) return out;
  const lastMonth = new Date(Date.UTC(pkYear, pkMonth - 2, 1)).toISOString().slice(0, 7);
  const hadResults = new Set(
    db.submissions.filter((x) => x.status === "released" && (x.submittedAt ?? "").slice(0, 7) === lastMonth).map((x) => x.studentId),
  );
  for (const student of students) {
    // Nothing marked last month means nothing to report.
    if (!hadResults.has(student.id)) continue;
    const report = db.reports.find((r) => r.studentId === student.id && r.month.slice(0, 7) === lastMonth);
    if (report?.sentAt) continue;
    const r: Reminder = {
      kind: "report_due",
      student,
      ref: `${lastMonth}-01`,
      label: `${monthName(lastMonth)} report for ${displayName(student.username)}`,
      message: parentReport({ id: student.id, username: student.username, month: monthName(lastMonth) }),
    };
    if (fresh(r)) out.push(r);
  }

  return out;
}
