"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { cohortById, studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { type LinePoint } from "@/components/charts/LineChart";
import { EmptyState, Icon } from "@/components/ui";
import { StudentReport } from "@/components/report/StudentReport";
import { gradeLetter, gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";

function monthOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 7) : "";
}

export default function ProgressPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const data = useMemo(() => {
    if (!student) return null;

    const allReleased = submissionsForStudent(db, student.id)
      .filter((s) => s.status === "released")
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

    const tests = allReleased.flatMap((s) => {
      const t = testById(db, s.testId);
      return t ? [t] : [];
    });

    // Monthly grouping
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const curSubs = allReleased.filter((s) => monthOf(s.submittedAt) === curMonth);
    const prevSubs = allReleased.filter((s) => monthOf(s.submittedAt) === prevMonth);

    function avg(subs: typeof allReleased) {
      if (!subs.length) return null;
      const sum = subs.reduce((a, s) => {
        const t = testById(db, s.testId);
        return t ? a + gradeSubmission(t, s).percent : a;
      }, 0);
      return Math.round((sum / subs.length) * 10) / 10;
    }

    const monthAvg = avg(curSubs);
    const prevMonthAvg = avg(prevSubs);
    const delta = monthAvg != null && prevMonthAvg != null
      ? Math.round((monthAvg - prevMonthAvg) * 10) / 10
      : null;
    const overallAvg = avg(allReleased);
    const grade = monthAvg != null ? gradeLetter(monthAvg) : overallAvg != null ? gradeLetter(overallAvg) : null;

    // Trend: all released, chronological
    const trendPoints: LinePoint[] = allReleased.flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ label: (s.submittedAt ?? "").slice(5, 10), value: gradeSubmission(t, s).percent }];
    });

    // Per-test list (most recent first)
    const perTest = [...allReleased].reverse().flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ test: t, sub: s, result: gradeSubmission(t, s) }];
    });

    // Topic mastery (ranked worst to best)
    const mastery = topicMastery(tests, allReleased);

    // Completion
    const available = testsForStudent(db, student).filter((t) => t.status !== "draft");
    const completionPct = available.length > 0
      ? Math.round((allReleased.length / available.length) * 100)
      : 0;

    return { allReleased, trendPoints, perTest, mastery, monthAvg, prevMonthAvg, delta, overallAvg, grade, completionPct, available: available.length };
  }, [db, student]);

  if (!student || !data) return null;

  if (data.allReleased.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">My progress</h1>
        <EmptyState
          className="mt-5"
          icon={<Icon.Chart />}
          title="Nothing yet"
          message="Once your teacher releases results, your scores and topic mastery show up here."
        />
      </div>
    );
  }

  const displayAvg = data.monthAvg ?? data.overallAvg ?? 0;
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const cohortName = cohortById(db, student.cohortId)?.name ?? null;

  // perTest is already most-recent-first; the report numbers them in that order.
  const reportTests = data.perTest.map(({ test, result }) => ({
    title: test.title,
    subject: test.subject,
    percent: result.percent,
    letter: result.letter,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="animate-fade-up">
        <StudentReport
          studentName={student.username}
          cohortName={cohortName}
          monthLabel={monthLabel}
          grade={data.grade}
          averagePct={displayAvg}
          deltaPct={data.delta}
          completion={{ pct: data.completionPct, done: data.allReleased.length, total: data.available }}
          trend={data.trendPoints}
          tests={reportTests}
        />
      </div>

      <Link href="/dashboard" className="block text-center text-sm font-semibold text-brand hover:underline">
        Back to home
      </Link>
    </div>
  );
}
