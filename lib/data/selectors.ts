/**
 * Pure selectors over the database snapshot, for display. Access itself is
 * enforced by row-level security in supabase/migrations.
 */
import type { Announcement, Student, Submission, Test, TestExtension, TestStats, TestStatus } from "@/types";
import type { Database } from "@/lib/data/seed";
import { awardedMarks, percent, totalMarks } from "@/lib/scoring";
import { takesLevelSubject } from "@/lib/levels";
import { isTestAccount } from "@/lib/display-name";

export const cohortById = (db: Database, id: string | null) =>
  id ? db.cohorts.find((c) => c.id === id) ?? null : null;
export const studentById = (db: Database, id: string) => db.students.find((s) => s.id === id) ?? null;
export const testById = (db: Database, id: string) => db.tests.find((t) => t.id === id) ?? null;

// ---- Archive ---------------------------------------------------------------
// Switching a cohort off moves everything that belongs to it into the archive:
// its students, its tests, and the work handed in for them. Nothing is deleted,
// and switching the cohort back on brings it all back.

/** Ids of the cohorts that are switched off. */
export function archivedCohortIds(db: Database): Set<string> {
  return new Set(db.cohorts.filter((c) => !c.active).map((c) => c.id));
}
/** A test for one switched-off cohort. Tests for everyone are never archived. */
export function isArchivedTest(db: Database, t: Test, off = archivedCohortIds(db)): boolean {
  return !!t.cohortId && off.has(t.cohortId);
}
/** A student whose cohort is switched off (a past student). */
export function isArchivedStudent(db: Database, s: Student, off = archivedCohortIds(db)): boolean {
  return off.has(s.cohortId);
}
/** Work handed in for an archived test, or by a past student. */
export function isArchivedSubmission(db: Database, sub: Submission, off = archivedCohortIds(db)): boolean {
  const t = testById(db, sub.testId);
  const st = studentById(db, sub.studentId);
  return (!!t && isArchivedTest(db, t, off)) || (!!st && isArchivedStudent(db, st, off));
}
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
  takesLevelSubject(student, test.classId, test.subjectId);

/** Students the test is assigned to — the denominator for completion (not those who joined after it closed). */
export const eligibleStudents = (db: Database, test: Test) =>
  db.students.filter(
    (s) => testCoversStudent(test, s) && (+new Date(test.closesAt) > joinedMs(s) || db.submissions.some((x) => x.testId === test.id && x.studentId === s.id)),
  );

/**
 * When a student's account was made. Their portal starts here: anything that
 * was already over before they joined (closed tests, past deadlines, old
 * notices and notifications) belongs to someone else's history, not theirs.
 */
export const joinedMs = (s: Student) => +new Date(s.createdAt) || 0;
/** Notices from the few days before joining still count (a welcome note, the session plan). */
const NOTICE_GRACE_MS = 3 * 86_400_000;

/** "/test/<id>#until=<ISO>" -> the ISO, or null. */
const untilOf = (link: string | undefined) => {
  const m = link?.match(/#until=([^&]+)$/);
  return m && !Number.isNaN(+new Date(decodeURIComponent(m[1]))) ? decodeURIComponent(m[1]) : null;
};

/**
 * Every late window, newest first. Each is a "test_reopened" notification
 * addressed to the student, with the end time carried in its link.
 */
export function lateWindows(db: Database): TestExtension[] {
  const out: TestExtension[] = [];
  const seen = new Set<string>();
  const rows = db.activities
    .filter((a) => a.type === "test_reopened" && a.testId && a.studentId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  for (const a of rows) {
    const key = `${a.testId}|${a.studentId}`;
    const until = untilOf(a.link);
    if (!until || seen.has(key)) continue; // only the newest window counts
    seen.add(key);
    out.push({ testId: a.testId!, studentId: a.studentId!, until, createdAt: a.createdAt });
  }
  return out;
}

/** The late window Hamza opened for this student on this test, if any. */
export function extensionFor(db: Database, testId: string, studentId: string): TestExtension | null {
  return lateWindows(db).find((e) => e.testId === testId && e.studentId === studentId) ?? null;
}

/**
 * Handed in during a late window Hamza opened. The database still flags these
 * "late" (it only knows the normal close time), so screens say so kindly.
 */
export function inLateWindow(db: Database, sub: Submission): boolean {
  const ext = extensionFor(db, sub.testId, sub.studentId);
  return !!ext && !!sub.submittedAt && +new Date(sub.submittedAt) <= +new Date(ext.until) + 2 * 60_000;
}

/**
 * The test as this student sees it: if Hamza reopened it just for them, it
 * closes at their own later time (and is marked `reopened`). Everyone else's
 * copy is unchanged.
 */
export function asSeenBy(db: Database, test: Test, studentId: string | null | undefined): Test {
  if (!studentId || test.status === "draft") return test;
  const ext = extensionFor(db, test.id, studentId);
  if (!ext || +new Date(ext.until) <= +new Date(test.closesAt)) return test;
  return { ...test, closesAt: ext.until, status: test.status === "closed" ? "active" : test.status, reopened: true };
}

/** One test by id, with this student's own late window applied. */
export const testForStudent = (db: Database, id: string, studentId: string | null | undefined) => {
  const t = testById(db, id);
  return t ? asSeenBy(db, t, studentId) : null;
};

/** Tests a student can see: cohort + class + subject match, never drafts, nothing that closed before they joined (unless they sat it). Late windows applied. */
export function testsForStudent(db: Database, student: Student): Test[] {
  const since = joinedMs(student);
  return db.tests
    .filter((t) => t.status !== "draft" && testCoversStudent(t, student))
    .map((t) => asSeenBy(db, t, student.id))
    .filter((t) => +new Date(t.closesAt) > since || db.submissions.some((s) => s.testId === t.id && s.studentId === student.id));
}

/** Announcements visible to a student (cohort-scoped), from shortly before they joined onwards. */
export function announcementsForStudent(db: Database, student: Student): Announcement[] {
  const since = joinedMs(student) - NOTICE_GRACE_MS;
  return db.announcements.filter(
    (a) => (a.cohortId === null || a.cohortId === student.cohortId) && +new Date(a.createdAt) >= since,
  );
}

/** Work a student is set: nothing whose deadline had passed before they joined (unless they handed it in). */
export function assignmentsForStudent(db: Database, student: Student) {
  const since = joinedMs(student);
  return db.assignments.filter(
    (a) => +new Date(a.dueAt) > since || db.assignmentSubmissions.some((s) => s.assignmentId === a.id && s.studentId === student.id),
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
  // Hamza's own test account never counts towards a test's figures.
  const practice = new Set(db.students.filter(isTestAccount).map((s) => s.id));
  const subs = submissionsForTest(db, test.id).filter((s) => !practice.has(s.studentId));
  const eligible = eligibleStudents(db, test).filter((s) => !practice.has(s.id)).length;
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
