/**
 * Pure selectors over the database snapshot. These approximate the row-level
 * security a real backend would enforce; TODO(rls) move scoping server-side.
 */
import type { Announcement, Student, Submission, Test, TestStats, TestStatus } from "@/types";
import type { Database } from "@/lib/data/seed";
import { awardedMarks, percent, totalMarks } from "@/lib/scoring";

export const cohortById = (db: Database, id: string | null) =>
  id ? db.cohorts.find((c) => c.id === id) ?? null : null;
export const studentById = (db: Database, id: string) => db.students.find((s) => s.id === id) ?? null;
export const testById = (db: Database, id: string) => db.tests.find((t) => t.id === id) ?? null;
export const submissionById = (db: Database, id: string) =>
  db.submissions.find((s) => s.id === id) ?? null;

export const studentsInCohort = (db: Database, cohortId: string) =>
  db.students.filter((s) => s.cohortId === cohortId);

/**
 * The status to show for a test. A test that is still marked active once its
 * close time has passed reads as closed — the window, not a manual edit, is
 * what actually stops students submitting (see `testWindow`), so the badge
 * follows the clock. Draft and a manual close are left alone.
 */
export function liveStatus(test: Test, nowMs = Date.now()): TestStatus {
  if (test.status === "active" && nowMs >= new Date(test.closesAt).getTime()) return "closed";
  return test.status;
}

/** Whether a test is scoped to this student: cohort + class + subject match. */
export const testCoversStudent = (test: Test, student: Student) =>
  (test.cohortId === null || test.cohortId === student.cohortId) &&
  (test.classId === null || student.classIds.includes(test.classId)) &&
  (test.subjectId === null || student.subjectIds.includes(test.subjectId));

/** Students the test is assigned to — the denominator for completion. */
export const eligibleStudents = (db: Database, test: Test) =>
  db.students.filter((s) => testCoversStudent(test, s));

/** Tests a student can see: cohort + class + subject match, never drafts. */
export function testsForStudent(db: Database, student: Student): Test[] {
  return db.tests.filter((t) => t.status !== "draft" && testCoversStudent(t, student));
}

/** Announcements visible to a student (cohort-scoped); pinned always shown. */
export function announcementsForStudent(db: Database, student: Student): Announcement[] {
  return db.announcements.filter(
    (a) => a.cohortId === null || a.cohortId === student.cohortId,
  );
}

export function submissionFor(db: Database, studentId: string, testId: string): Submission | null {
  return (
    db.submissions.find((s) => s.studentId === studentId && s.testId === testId) ?? null
  );
}

export function submissionsForTest(db: Database, testId: string): Submission[] {
  return db.submissions.filter((s) => s.testId === testId);
}

export function submissionsForStudent(db: Database, studentId: string): Submission[] {
  return db.submissions.filter((s) => s.studentId === studentId);
}

/** Per-test admin stats: submissions, average %, completion %. */
export function testStats(db: Database, test: Test): TestStats {
  const subs = submissionsForTest(db, test.id);
  const eligible = eligibleStudents(db, test).length;
  const total = totalMarks(test);
  // Average only what has actually been marked. Counting a script that is still
  // waiting on the teacher as 0 dragged every average down to nonsense.
  const graded = subs.filter((s) => s.status === "released");
  const averagePercent =
    graded.length > 0 && total > 0
      ? Math.round(
          (graded.reduce((sum, s) => sum + percent(awardedMarks(s), total), 0) / graded.length) * 10,
        ) / 10
      : null;
  return {
    submissionCount: subs.length,
    pendingCount: subs.filter((s) => s.status === "submitted").length,
    averagePercent,
    completionPercent: eligible > 0 ? Math.round((subs.length / eligible) * 100) : 0,
  };
}

// ---- Attendance ------------------------------------------------------------

/**
 * A student's attendance for a month, as a percentage.
 *
 * A typed monthly figure always wins — it is the teacher's own number, entered
 * or corrected by hand. Otherwise it is derived from the daily register, where
 * a late counts as half a day present.
 */
export function attendancePercent(db: Database, studentId: string, month: string): number | null {
  const typed = db.attendanceMonths.find((a) => a.studentId === studentId && a.month === month);
  if (typed) return typed.percent;

  const days = db.attendanceDays.filter(
    (a) => a.studentId === studentId && a.date.slice(0, 7) === month.slice(0, 7),
  );
  if (!days.length) return null;
  const score = days.reduce((n, d) => n + (d.status === "present" ? 1 : d.status === "late" ? 0.5 : 0), 0);
  return Math.round((score / days.length) * 1000) / 10;
}

/** Consecutive absences ending at the most recent recorded day. */
export function absenceStreak(db: Database, studentId: string): number {
  const days = db.attendanceDays
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date));
  let n = 0;
  for (const d of days) {
    if (d.status !== "absent") break;
    n++;
  }
  return n;
}
