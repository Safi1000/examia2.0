import type { Student, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { submissionsForStudent, testById } from "@/lib/data/selectors";
import { gradeLetter, gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";

/**
 * The student's performance at a glance, for Home: where they are now (last
 * five marked tests), which way it's moving, and the topics to work on.
 */
export interface Snapshot {
  /** Average of the last five marked tests. */
  recent: number;
  grade: string;
  /** Recent average minus the five before it (null until there are enough). */
  delta: number | null;
  marked: number;
  /** Last eight results, oldest first, for the sparkline. */
  points: number[];
  last: { test: Test; percent: number; letter: string } | null;
  weakest: Array<{ subject: string; name: string; percent: number }>;
  /** Each subject's recent average (last five marked tests in it). */
  bySubject: Array<{ subject: string; recent: number; grade: string }>;
}

/** Lowest percentage for each target grade (same bands as gradeLetter). */
export const GRADE_FLOOR: Record<string, number> = { "A*": 92, A: 85, B: 75, C: 65 };

/** "Business Studies" and "Business" are the same subject. */
export const sameSubject = (a: string, b: string) => a.trim().toLowerCase().slice(0, 4) === b.trim().toLowerCase().slice(0, 4);

export function performanceSnapshot(db: Database, student: Student): Snapshot | null {
  const released = submissionsForStudent(db, student.id)
    .filter((s) => s.status === "released")
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const results = released.flatMap((s) => {
    const t = testById(db, s.testId);
    return t ? [{ test: t, sub: s, pct: gradeSubmission(t, s).percent }] : [];
  });
  if (!results.length) return null;

  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  const pcts = results.map((r) => r.pct);
  const recentSet = pcts.slice(-5);
  const before = pcts.slice(-10, -5);
  const recent = avg(recentSet);
  const lastR = results[results.length - 1];

  const subjects = [...new Set(results.map((r) => r.test.subject.trim()))];
  const bySubject = subjects.map((subject) => {
    const mine = results.filter((r) => r.test.subject.trim() === subject).map((r) => r.pct).slice(-5);
    const a = avg(mine);
    return { subject, recent: a, grade: gradeLetter(a) };
  });

  return {
    bySubject,
    recent,
    grade: gradeLetter(recent),
    delta: before.length >= 2 ? Math.round((recent - avg(before)) * 10) / 10 : null,
    marked: results.length,
    points: pcts.slice(-8),
    last: { test: lastR.test, percent: Math.round(lastR.pct), letter: gradeLetter(lastR.pct) },
    weakest: topicMastery(
      results.map((r) => r.test),
      results.map((r) => r.sub),
    )
      .filter((m) => m.available > 0 && m.percent < 70)
      .slice(0, 2)
      .map((m) => ({ subject: m.subject, name: m.name, percent: Math.round(m.percent) })),
  };
}

/** Every topic under 70% in the student's marked tests: the Groundwork review queue. */
export function weakTopics(db: Database, student: Student): Array<{ subject: string; topic: string }> {
  const released = submissionsForStudent(db, student.id).filter((s) => s.status === "released");
  const tests = released.flatMap((s) => {
    const t = testById(db, s.testId);
    return t ? [t] : [];
  });
  if (!tests.length) return [];
  return topicMastery(tests, released)
    .filter((m) => m.available > 0 && m.percent < 70)
    .map((m) => ({ subject: m.subject, topic: m.name }));
}
