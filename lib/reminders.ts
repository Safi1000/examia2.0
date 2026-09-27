import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { absenceStreak, liveStatus, testCoversStudent } from "@/lib/data/selectors";
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
  const students = db.students.filter((s) => (cohortId ? s.cohortId === cohortId : true));
  const out: Reminder[] = [];

  const add = (r: Reminder) => {
    if (!sent.has(`${r.student.id}|${r.kind}|${r.ref}`)) out.push(r);
  };

  // 1. Tests that have closed with nothing handed in.
  const closed = db.tests.filter((t) => liveStatus(t, nowMs) === "closed");
  for (const test of closed) {
    for (const student of students) {
      if (!testCoversStudent(test, student)) continue;
      if (db.submissions.some((s) => s.testId === test.id && s.studentId === student.id)) continue;
      add({
        kind: "missed_test",
        student,
        ref: test.id,
        label: `${student.username} did not sit "${test.title}"`,
        message: `Assalam o Alaikum. ${student.username} has not submitted "${test.title}" (${test.subject}), which has now closed. Please ask them to catch up. — ${COMPANY_NAME}`,
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
      message: `Assalam o Alaikum. ${student.username} has missed ${streak} classes in a row. Is everything alright? — ${COMPANY_NAME}`,
    });
  }

  // 3. Last month's report, from the 1st onwards.
  const now = new Date(nowMs);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  for (const student of students) {
    const report = db.reports.find((r) => r.studentId === student.id && r.month.slice(0, 7) === lastMonth);
    if (report?.sentAt) continue;
    add({
      kind: "report_due",
      student,
      ref: `${lastMonth}-01`,
      label: `${monthName(lastMonth)} report for ${student.username}`,
      message: `Assalam o Alaikum. Here is ${student.username}'s progress report for ${monthName(lastMonth)}. — ${COMPANY_NAME}`,
    });
  }

  return out;
}
