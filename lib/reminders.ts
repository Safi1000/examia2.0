import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { absenceStreak, archivedCohortIds, extensionFor, isArchivedTest, liveStatus, testCoversStudent } from "@/lib/data/selectors";
import { isTestAccount } from "@/lib/display-name";
import { COMPANY_NAME } from "@/lib/config";
import { inPersonIds } from "@/lib/in-person";
import { awardedMarks, isFullyGraded, percent, totalMarks } from "@/lib/scoring";
import { pkDate } from "@/lib/timetable";

/** Results under this percentage are worth a word with the parents. */
export const LOW_SCORE = 70;

/**
 * What the admin still has to chase.
 *
 * Nothing is scheduled or stored: the list is derived from the data every time
 * the panel renders, minus whatever has already been sent. Adding a new kind of
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
  low_score: { label: "Below 70%", tone: "warning" },
  report_due: { label: "Report to send", tone: "brand" },
};

const monthName = (month: string) => {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
};

export function dueReminders(db: Database, nowMs: number, cohortId: string | null): Reminder[] {
  const sent = new Set(db.remindersSent.map((r) => `${r.studentId}|${r.kind}|${r.ref}`));
  // Past students (switched-off cohorts) are never chased.
  const off = archivedCohortIds(db);
  // In-person students are managed in class: no parent messages or monthly reports from here.
  // Hamza's own test account is never chased either.
  const inPerson = inPersonIds(db);
  const students = db.students.filter((s) => !off.has(s.cohortId) && !inPerson.has(s.id) && !isTestAccount(s) && (cohortId ? s.cohortId === cohortId : true));
  const out: Reminder[] = [];

  const add = (r: Reminder) => {
    if (!sent.has(`${r.student.id}|${r.kind}|${r.ref}`)) out.push(r);
  };

  // 1. Tests that closed in the last 14 days with nothing handed in. Older
  // ones are history, and a student who joined after the test opened owes
  // nothing for it.
  const RECENT = 14 * 24 * 60 * 60 * 1000;
  const closed = db.tests.filter(
    (t) => liveStatus(t, nowMs) === "closed" && nowMs - new Date(t.closesAt).getTime() <= RECENT && !isArchivedTest(db, t, off),
  );
  // Looked up once: scanning every submission for every student and test is slow with a full roster.
  const started = closed.length ? new Set(db.submissions.map((s) => `${s.testId}|${s.studentId}`)) : new Set<string>();
  for (const test of closed) {
    for (const student of students) {
      if (!testCoversStudent(test, student)) continue;
      if (new Date(student.createdAt).getTime() > new Date(test.opensAt).getTime()) continue;
      if (started.has(`${test.id}|${student.id}`)) continue;
      // Reopened just for them and still open: not missed (yet).
      const ext = extensionFor(db, test.id, student.id);
      if (ext && +new Date(ext.until) > nowMs) continue;
      add({
        kind: "missed_test",
        student,
        ref: test.id,
        label: `${student.username} did not sit "${test.title}"`,
        message: `Assalam o Alaikum. ${student.username} has not submitted "${test.title}" (${test.subject}), which has now closed. Please ask them to catch up. ${COMPANY_NAME}`,
      });
    }
  }

  // 2. Absent two or more classes in a row.
  for (const student of students) {
    const streak = absenceStreak(db, student.id);
    if (streak < 2) continue;
    const last = db.attendanceDays
      .filter((a) => a.studentId === student.id && a.status === "absent")
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    add({
      kind: "absent_streak",
      student,
      ref: last?.date ?? String(streak),
      label: `${student.username} has been absent ${streak} classes in a row`,
      message: `Assalam o Alaikum. ${student.username} has missed ${streak} classes in a row. Is everything alright? ${COMPANY_NAME}`,
    });
  }

  // 3. A result under 70%, released in the last 14 days.
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const sub of db.submissions) {
    if (sub.status !== "released" || !sub.releasedAt || nowMs - new Date(sub.releasedAt).getTime() > RECENT) continue;
    const student = byId.get(sub.studentId);
    const test = db.tests.find((t) => t.id === sub.testId);
    if (!student || !test || isArchivedTest(db, test, off)) continue;
    const total = totalMarks(test);
    // Only results that are fully marked: an unmarked answer would count as zero.
    if (!total || !isFullyGraded(test, sub)) continue;
    const pct = percent(awardedMarks(sub), total);
    // Judged on the rounded figure the label shows, so "scored 70%" never sits under "Below 70%".
    if (Math.round(pct) >= LOW_SCORE) continue;
    add({
      kind: "low_score",
      student,
      ref: sub.id,
      label: `${student.username} scored ${Math.round(pct)}% in "${test.title}"`,
      message: `Assalam o Alaikum. ${student.username} scored ${Math.round(pct)}% in "${test.title}" (${test.subject}). The marked paper with my feedback is in their portal. Please sit with them this week to go through what went wrong. ${COMPANY_NAME}`,
    });
  }

  // 4. Last month's report, from the 1st onwards. The month turns over at
  // midnight in Pakistan, whatever time zone the laptop or tablet is set to.
  const [pkYear, pkMonth] = pkDate(nowMs).split("-").map(Number);
  const lastMonth = new Date(Date.UTC(pkYear, pkMonth - 2, 1)).toISOString().slice(0, 7);
  const hadResults = new Set(
    db.submissions.filter((x) => x.status === "released" && (x.submittedAt ?? "").slice(0, 7) === lastMonth).map((x) => x.studentId),
  );
  for (const student of students) {
    // Nothing marked last month means nothing to report.
    if (!hadResults.has(student.id)) continue;
    const report = db.reports.find((r) => r.studentId === student.id && r.month.slice(0, 7) === lastMonth);
    if (report?.sentAt) continue;
    add({
      kind: "report_due",
      student,
      ref: `${lastMonth}-01`,
      label: `${monthName(lastMonth)} report for ${student.username}`,
      message: `Assalam o Alaikum. Here is ${student.username}'s progress report for ${monthName(lastMonth)}. ${COMPANY_NAME}`,
    });
  }

  return out;
}
