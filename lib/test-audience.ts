import type { Student, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { archivedCohortIds, testCoversStudent } from "@/lib/data/selectors";

type Scope = Pick<Test, "cohortId" | "classId" | "subjectId">;

/** Current students a test with this cohort, class and subject goes to. */
export function audienceOf(db: Database, scope: Scope): Student[] {
  const off = archivedCohortIds(db);
  return db.students.filter((s) => !off.has(s.cohortId) && testCoversStudent(scope as Test, s));
}

/** True when a test is set to every class or no subject: easy to publish to everyone by mistake. */
export const goesWide = (scope: Scope) => !scope.classId || !scope.subjectId;

/**
 * One plain sentence on who a wide test reaches, e.g. "This goes to all 84
 * students, in every class and every subject." Null when it names both.
 */
export function wideLine(db: Database, scope: Scope, what = "This"): string | null {
  if (!goesWide(scope)) return null;
  const n = audienceOf(db, scope).length;
  const who = `${n} ${n === 1 ? "student" : "students"}`;
  const cohort = scope.cohortId ? db.cohorts.find((c) => c.id === scope.cohortId)?.name : null;
  const inCohort = cohort ? ` in ${cohort}` : "";
  if (!scope.classId && !scope.subjectId) return `${what} goes to all ${who}${inCohort}, in every class and every subject.`;
  if (!scope.classId) {
    const subject = db.subjects.find((s) => s.id === scope.subjectId)?.name ?? "this subject";
    return `${what} goes to all ${who}${inCohort} taking ${subject}, in every class.`;
  }
  const level = db.classes.find((c) => c.id === scope.classId)?.name ?? "this class";
  return `${what} goes to all ${who} in ${level}${inCohort}, whatever their subject.`;
}
