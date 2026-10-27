import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { absenceStreak, archivedCohortIds, isArchivedTest, liveStatus, testCoversStudent } from "@/lib/data/selectors";
import { COMPANY_NAME } from "@/lib/config";

/**
 * What the admin still has to chase.
 *
 * Nothing is scheduled or stored: the list is derived from the data every time
 * the panel renders, minus whatever has already been sent. Adding a new kind of
 * reminder means adding one entry to KINDS and one branch in `dueReminders` —
 * the panel, the dedupe and the send button need no changes.
 */

export type ReminderKind = "missed_test" | "absent_streak" | "report_due";

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
  missed_test: { label: "Missed a test", tone: "warning" },
  absent_streak: { label: "Absent repeatedly", tone: "error" },
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
  const students = db.students.filter((s) => !off.has(s.cohortId) && (cohortId ? s.cohortId === cohortId : true));
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
  for (const test of closed) {
    for (const student of students) {
      if (!testCoversStudent(test, student)) continue;
      if (new Date(student.createdAt).getTime() > new Date(test.opensAt).getTime()) continue;
      if (db.submissions.some((s) => s.testId === test.id && s.studentId === student.id)) continue;
      add({
        kind: "missed_test",
        student,
        ref: test.id,
        label: `${student.username} did not sit "${test.title}"`,
        message: `Assalam o Alaikum. ${student.username} has not submitted "${test.title}" (${test.subject}), which has now closed. Please ask them to catch up. ${COMPANY_NAME}`,
      });
    }
  }

  // 2. Two or more absences in a row.
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

  // 3. Last month's report, from the 1st onwards.
  const now = new Date(nowMs);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  for (const student of students) {
    // Nothing marked last month means nothing to report.
    const hadResults = db.submissions.some(
      (x) => x.studentId === student.id && x.status === "released" && (x.submittedAt ?? "").slice(0, 7) === lastMonth,
    );
    if (!hadResults) continue;
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
