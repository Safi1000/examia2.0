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
}

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

  return {
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
