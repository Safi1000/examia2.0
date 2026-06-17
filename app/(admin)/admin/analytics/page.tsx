"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon, TableScroll, Table, Th, Td } from "@/components/ui";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { gradeLetter, gradeRole, gradeSubmission, GRADE_ORDER } from "@/lib/grading";
import { awardedMarks, percent, topicMastery, totalMarks } from "@/lib/scoring";

export default function AnalyticsPage() {
  const db = useDatabase();
  const { cohortId } = useAdminFilter();

  const a = useMemo(() => {
    const students = db.students.filter((s) => (cohortId ? s.cohortId === cohortId : true));
    const studentIds = new Set(students.map((s) => s.id));
    const relevantTests = db.tests.filter((t) => (cohortId ? t.cohortId === cohortId || t.cohortId === null : true));
    const relevantTestIds = new Set(relevantTests.map((t) => t.id));

    const subs = db.submissions.filter((s) => studentIds.has(s.studentId) && relevantTestIds.has(s.testId));
    const released = subs.filter((s) => s.status === "released");

    const testById = new Map(db.tests.map((t) => [t.id, t]));
    const avgScore = released.length
      ? Math.round(
          (released.reduce((sum, s) => {
            const t = testById.get(s.testId)!;
            return sum + percent(awardedMarks(s), totalMarks(t));
          }, 0) / released.length) * 10,
        ) / 10
      : 0;

    const expected = students.length * relevantTests.filter((t) => t.status !== "draft").length;
    const participation = expected > 0 ? Math.round((subs.length / expected) * 100) : 0;

    // Grade distribution
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    released.forEach((s) => {
      const t = testById.get(s.testId)!;
      dist[gradeLetter(gradeSubmission(t, s).percent)]++;
    });
    const bars: Bar[] = GRADE_ORDER.map((g) => ({ label: g, value: dist[g], role: gradeRole(g) }));

    // Per-test averages
    const perTest = relevantTests.map((t) => {
      const ts = released.filter((s) => s.testId === t.id);
      const avg = ts.length ? Math.round((ts.reduce((sum, s) => sum + percent(awardedMarks(s), totalMarks(t)), 0) / ts.length) * 10) / 10 : null;
      return { test: t, count: ts.length, avg };
    });

    // Topic weakness
    const mastery = topicMastery(relevantTests, released);

    // Leaderboard
    const leaderboard = students
      .map((st) => {
        const sr = released.filter((s) => s.studentId === st.id);
        const avg = sr.length ? sr.reduce((sum, s) => sum + percent(awardedMarks(s), totalMarks(testById.get(s.testId)!)), 0) / sr.length : null;
        return { student: st, avg: avg != null ? Math.round(avg * 10) / 10 : null, count: sr.length };
      })
      .filter((x) => x.avg != null)
      .sort((x, y) => (y.avg ?? 0) - (x.avg ?? 0));

    return { students, released, subs, avgScore, participation, bars, perTest, mastery, leaderboard, hasData: released.length > 0 };
  }, [db, cohortId]);

  const scopeCohort = cohortId ? cohortById(db, cohortId) : null;

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Analytics"
        subtitle={scopeCohort ? `Filtered to ${scopeCohort.name}` : "All cohorts"}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Average score" value={`${a.avgScore}%`} />
        <Metric label="Students" value={String(a.students.length)} />
        <Metric label="Results released" value={String(a.released.length)} />
        <Metric label="Participation" value={`${a.participation}%`} />
      </div>

      {!a.hasData ? (
        <EmptyState className="mt-6" icon={<Icon.Chart />} title="No released results yet" message="Release some results to populate class analytics." />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Grade distribution</h2>
            <BarChart bars={a.bars} />
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Topic weakness</h2>
            <div className="space-y-3.5">
              {a.mastery.length === 0 ? <p className="text-sm text-ink-3">No graded topics yet.</p> : a.mastery.map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)}
            </div>
          </Card>

          <Card className="p-0 lg:col-span-2">
            <div className="border-b border-border px-5 py-3.5"><h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Per-test averages</h2></div>
            <TableScroll>
              <Table stickyFirst>
                <thead><tr><Th>Test</Th><Th>Subject</Th><Th>Results</Th><Th>Average</Th></tr></thead>
                <tbody>
                  {a.perTest.map(({ test, count, avg }) => (
                    <tr key={test.id}>
                      <Td className="font-semibold">{test.title}</Td>
                      <Td className="text-ink-2">{test.subject}</Td>
                      <Td className="font-mono">{count}</Td>
                      <Td className="font-mono">{avg != null ? `${avg}%` : <span className="text-ink-3">—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          </Card>

          <Card className="p-0 lg:col-span-2">
            <div className="border-b border-border px-5 py-3.5"><h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Leaderboard</h2></div>
            <ul className="divide-y divide-border">
              {a.leaderboard.map((row, i) => {
                const cohort = cohortById(db, row.student.cohortId);
                return (
                  <li key={row.student.id}>
                    <Link href={`/admin/roster/${row.student.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                      <span className="w-6 text-center font-mono text-sm font-bold text-ink-3">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold capitalize text-ink">{row.student.username}</p>
                        <p className="flex items-center gap-1.5 text-xs text-ink-2">{cohort && <CohortDot color={cohort.color} />}{cohort?.name} · {row.count} results</p>
                      </div>
                      <Badge tone={(row.avg ?? 0) >= 60 ? "success" : "warning"}>{row.avg}%</Badge>
                      <Icon.ChevronRight className="h-4 w-4 text-ink-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card ruled className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold text-ink">{value}</p>
    </Card>
  );
}
