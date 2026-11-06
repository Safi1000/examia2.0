import type { Database } from "@/lib/data/seed";
import type { Assignment, Student, Test } from "@/types";
import { assignmentsForStudent, submissionFor, testsForStudent } from "@/lib/data/selectors";
import { testWindow } from "@/lib/time";

export type Due = {
  /** Tests open right now and not started or handed in, soonest closing first. */
  openTests: Test[];
  /** The next test still to open. */
  nextTest: Test | null;
  /** Homework past its deadline (last two weeks), not handed in. */
  overdue: Assignment[];
  /** Homework still to come, not handed in. */
  dueSoon: Assignment[];
};

/** Everything a student still has to do. One rule for Home, the tab bar and Work. */
export function dueFor(db: Database, student: Student, nowMs: number): Due {
  const all = testsForStudent(db, student);
  const openTests = all
    .filter((t) => testWindow(t.opensAt, t.closesAt, nowMs) === "open" && !submissionFor(db, student.id, t.id))
    .sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt));
  const nextTest =
    all.filter((t) => testWindow(t.opensAt, t.closesAt, nowMs) === "future").sort((a, b) => +new Date(a.opensAt) - +new Date(b.opensAt))[0] ?? null;
  const handedIn = new Set(db.assignmentSubmissions.filter((x) => x.studentId === student.id).map((x) => x.assignmentId));
  const mine = assignmentsForStudent(db, student).filter((a) => !handedIn.has(a.id));
  const byDue = (a: Assignment, b: Assignment) => +new Date(a.dueAt) - +new Date(b.dueAt);
  const dueSoon = mine.filter((a) => +new Date(a.dueAt) > nowMs).sort(byDue);
  const overdue = mine.filter((a) => {
    const due = +new Date(a.dueAt);
    return due <= nowMs && nowMs - due < 14 * 86_400_000;
  }).sort(byDue);
  return { openTests, nextTest, overdue, dueSoon };
}
