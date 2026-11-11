"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { attendancePercent, cohortById, eligibleStudents, testsForStudent } from "@/lib/data/selectors";
import { isTestAccount } from "@/lib/display-name";
import { useNow } from "@/hooks/useNow";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon, TableScroll, Table, Th, Td } from "@/components/ui";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { StudentReport } from "@/components/report/StudentReport";
import { capAs, gradeLetter, gradeRole, gradeSubmission, isAsClass, isAsStudent, GRADE_ORDER, type GradeLetter } from "@/lib/grading";
import { awardedMarks, percent, topicMastery, totalMarks, type TopicMastery } from "@/lib/scoring";
import type { Cohort, Student, Submission, Test } from "@/types";
import { cn } from "@/lib/cn";

type View = "class" | "student";

const PKT_MS = 5 * 3_600_000; // Pakistan is UTC+5, no daylight saving

/** "2026-11" in Pakistan time: a script handed in at 1 am on the 1st belongs to the new month, not the old. */
function monthOf(iso: string | null | undefined): string {
  return iso ? new Date(+new Date(iso) + PKT_MS).toISOString().slice(0, 7) : "";
}

/** The calendar month before "2026-11": "2026-10". */
function monthBefore(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatMonth(m: string): string {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return `${LONG_MONTHS[Number(mo) - 1]} ${y}`;
}

/** Chart label for a month: "Oct", or "Oct 25" when the chart spans more than one year. */
function shortMonth(m: string, withYear: boolean): string {
  const [y, mo] = m.split("-");
  return withYear ? `${MONTHS[Number(mo) - 1]} ${y.slice(2)}` : MONTHS[Number(mo) - 1];
}

/** "3 Nov", the Pakistan date of a hand in. */
function shortDay(iso: string): string {
  const d = new Date(+new Date(iso) + PKT_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Fewer marks than this on a topic is too little to call it weak or strong with confidence. */
const SMALL_SAMPLE_MARKS = 6;

function calcAvg(subs: Submission[], testById: Map<string, Test>): number {
  if (!subs.length) return 0;
  const sum = subs.reduce((s, sub) => {
    const t = testById.get(sub.testId);
    return t ? s + percent(awardedMarks(sub), totalMarks(t)) : s;
  }, 0);
  return Math.round((sum / subs.length) * 10) / 10;
}

// ---- Typed data shapes -----

interface PerTestRow { test: Test; count: number; avg: number | null; top: GradeLetter | null; pending: number }
interface StudentMovement { student: Student; curAvg: number | null; delta: number | null }
interface CohortCompletion { cohort: Cohort; pct: number; submitted: number; expected: number }

interface ClassViewData {
  overall: number;
  monthly: number;
  delta: number | null;
  trendPoints: LinePoint[];
  bars: Bar[];
  perTest: PerTestRow[];
  improved: StudentMovement[];
  slipping: StudentMovement[];
  mastery: TopicMastery[];
  cohortCompletion: CohortCompletion[];
  topStudents: number;
  strugglingStudents: number;
  toMark: number;
  attendanceAvg: number | null;
}

interface StudentPerTest { test: Test; result: ReturnType<typeof gradeSubmission> }

interface StudentViewData {
  student: Student;
  avg: number | null;
  delta: number | null;
  grade: GradeLetter | null;
  trendPoints: LinePoint[];
  perTest: StudentPerTest[];
  mastery: TopicMastery[];
  completionPct: number;
  completed: number;
  total: number;
}

// ---- Page ------------------------------------------------------------------

export default function AnalyticsPage() {
  const db = useDatabase();
  const { cohortId } = useAdminFilter();
  const [view, setView] = useState<View>("class");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const nowMs = useNow();

  const testById = useMemo(() => new Map(db.tests.map((t) => [t.id, t])), [db.tests]);

  const base = useMemo(() => {
    const activeCohorts = new Set(db.cohorts.filter((c) => c.active).map((c) => c.id));
    const students = db.students
      .filter((s) => activeCohorts.has(s.cohortId))
      // Hamza's own test account stays out of every average and completion figure.
      .filter((s) => !isTestAccount(s))
      .filter((s) => (cohortId ? s.cohortId === cohortId : true));
    const studentIds = new Set(students.map((s) => s.id));
    // Tests for switched-off (archived) cohorts are left out.
    const inScope = (t: Test) =>
      !(t.cohortId && !activeCohorts.has(t.cohortId)) &&
      (cohortId ? t.cohortId === cohortId || t.cohortId === null : true);
    // Every test that has been sat, draft or not: a released result is real
    // work, and dropping it because its test was left in draft is how whole
    // months went missing from these charts.
    const relevantTests = db.tests.filter(inScope);
    const relevantTestIds = new Set(relevantTests.map((t) => t.id));
    // Only published tests count as "what was set" (completion).
    const setTests = relevantTests.filter((t) => t.status !== "draft");
    const released = db.submissions.filter(
      (s) => s.status === "released" && studentIds.has(s.studentId) && relevantTestIds.has(s.testId),
    );
    const awaiting = db.submissions.filter(
      (s) => s.status === "submitted" && studentIds.has(s.studentId) && relevantTestIds.has(s.testId),
    );
    const allMonths = Array.from(new Set(released.map((s) => monthOf(s.submittedAt)).filter(Boolean))).sort();
    return { students, studentIds, relevantTests, setTests, relevantTestIds, released, awaiting, allMonths };
  }, [db, cohortId]);

  // Opens on the latest month; "all" is the All time choice. The menu always
  // shows the month the numbers are for (it used to say All time over November).
  const activeMonth = selectedMonth === "all" ? "" : selectedMonth || base.allMonths[base.allMonths.length - 1] || "";
  // "vs last month" is the calendar month before, or nothing: comparing with
  // whichever older month happened to have results was misleading.
  const prevMonth = activeMonth && base.allMonths.includes(monthBefore(activeMonth)) ? monthBefore(activeMonth) : "";

  const monthSubs = useMemo(
    () => (activeMonth ? base.released.filter((s) => monthOf(s.submittedAt) === activeMonth) : base.released),
    [base.released, activeMonth],
  );
  const prevMonthSubs = useMemo(
    () => (prevMonth ? base.released.filter((s) => monthOf(s.submittedAt) === prevMonth) : []),
    [base.released, prevMonth],
  );

  const classData = useMemo((): ClassViewData => {
    const overall = calcAvg(base.released, testById);
    const monthly = calcAvg(monthSubs, testById);
    const prevMonthAvg = calcAvg(prevMonthSubs, testById);
    const delta = prevMonthSubs.length ? Math.round((monthly - prevMonthAvg) * 10) / 10 : null;

    const manyYears = new Set(base.allMonths.map((m) => m.slice(0, 4))).size > 1;
    const trendPoints: LinePoint[] = base.allMonths.map((m) => ({
      label: shortMonth(m, manyYears),
      value: calcAvg(base.released.filter((s) => monthOf(s.submittedAt) === m), testById),
    }));

    // Distribution covers every released result in scope; the month filter
    // steers the cards and the per-test table, not this chart.
    const dist: Record<string, number> = Object.fromEntries(GRADE_ORDER.map((g) => [g, 0]));
    base.released.forEach((s) => {
      const t = testById.get(s.testId);
      if (t) dist[gradeSubmission(t, s).letter]++;
    });
    const bars: Bar[] = GRADE_ORDER.map((g) => ({ label: g, value: dist[g] ?? 0, role: gradeRole(g) }));

    // Headline counts are per STUDENT (their average for the month), not per
    // script - counting scripts is how a roster of 17 reported 25.
    const perStudentGrade = base.students.flatMap((st) => {
      const subs = monthSubs.filter((x) => x.studentId === st.id);
      return subs.length ? [capAs(gradeLetter(calcAvg(subs, testById)), isAsStudent(st.id))] : [];
    });
    const topStudents = perStudentGrade.filter((g) => g === "A*" || g === "A").length;
    const strugglingStudents = perStudentGrade.filter((g) => g === "E" || g === "U").length;
    const toMark = base.awaiting.length;

    // Only tests with something to show: rows of "0 / None" for every test
    // ever made buried the ones that mattered.
    const perTest: PerTestRow[] = base.relevantTests.map((t) => {
      const ts = monthSubs.filter((s) => s.testId === t.id);
      const avg = ts.length ? calcAvg(ts, testById) : null;
      const top = ts.length
        ? (capAs(gradeLetter(Math.max(...ts.map((s) => gradeSubmission(t, s).percent))), isAsClass(t.classId) || ts.every((s) => isAsStudent(s.studentId))) as GradeLetter)
        : null;
      // Sat but not yet marked: such a test reads "2 to mark", never "0%".
      const pending = base.awaiting.filter((x) => x.testId === t.id).length;
      return { test: t, count: ts.length, avg, top, pending };
    }).filter((r) => r.count > 0 || r.pending > 0).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

    const movement = base.students.map((st) => {
      const cur = monthSubs.filter((s) => s.studentId === st.id);
      const prev = prevMonthSubs.filter((s) => s.studentId === st.id);
      const curAvg = cur.length ? calcAvg(cur, testById) : null;
      const prevAvg = prev.length ? calcAvg(prev, testById) : null;
      const d = curAvg != null && prevAvg != null ? Math.round((curAvg - prevAvg) * 10) / 10 : null;
      return { student: st, curAvg, delta: d };
    }).filter((x) => x.delta != null);

    const improved = [...movement].filter((x) => (x.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 5);
    const slipping = [...movement].filter((x) => (x.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5);

    const mastery = topicMastery(base.relevantTests, monthSubs);

    // Attendance for the month in view, averaged over the students who have it
    // recorded — nothing recorded means the card stays hidden rather than 0%.
    const attendanceValues = base.students
      .map((st) => attendancePercent(db, st.id, `${activeMonth || monthOf(new Date(nowMs).toISOString())}-01`))
      .filter((v): v is number => v != null);
    const attendanceAvg = attendanceValues.length
      ? Math.round((attendanceValues.reduce((a, b) => a + b, 0) / attendanceValues.length) * 10) / 10
      : null;

    // Switched-off cohorts are finished business: out of analytics entirely.
    // Expected = each test that has opened, times the students it was set for
    // (its class and subject, and not those who joined after it closed).
    // Handed in = those same students' finished scripts, so it can never pass
    // 100%: tests not open yet, half-started scripts and scripts from students
    // outside the test's class used to count.
    const handedIn = new Set(db.submissions.filter((x) => x.status !== "in_progress").map((x) => `${x.testId}|${x.studentId}`));
    const cohortCompletion: CohortCompletion[] = db.cohorts.filter((c) => c.active).map((c) => {
      const ct = base.setTests.filter((t) => (t.cohortId === c.id || t.cohortId === null) && +new Date(t.opensAt) <= nowMs);
      let expected = 0;
      let submitted = 0;
      for (const t of ct) {
        for (const st of eligibleStudents(db, t)) {
          if (st.cohortId !== c.id || !base.studentIds.has(st.id)) continue;
          expected++;
          if (handedIn.has(`${t.id}|${st.id}`)) submitted++;
        }
      }
      const pct = expected > 0 ? Math.min(100, Math.round((submitted / expected) * 100)) : 0;
      return { cohort: c, pct, submitted, expected };
    }).filter((x) => x.expected > 0);

    return { overall, monthly, delta, trendPoints, bars, perTest, improved, slipping, mastery, cohortCompletion, topStudents, strugglingStudents, toMark, attendanceAvg };
  }, [base, monthSubs, prevMonthSubs, testById, db, activeMonth, nowMs]);

  const studentData = useMemo((): StudentViewData | null => {
    const student = db.students.find((s) => s.id === selectedStudentId);
    if (!student) return null;

    const allSubs = base.released.filter((s) => s.studentId === student.id);
    const curSubs = monthSubs.filter((s) => s.studentId === student.id);
    const prevSubs = prevMonthSubs.filter((s) => s.studentId === student.id);

    const avg = curSubs.length ? calcAvg(curSubs, testById) : null;
    const prevAvg = prevSubs.length ? calcAvg(prevSubs, testById) : null;
    const delta = avg != null && prevAvg != null ? Math.round((avg - prevAvg) * 10) / 10 : null;
    const grade = avg != null ? capAs(gradeLetter(avg), isAsStudent(student.id)) : null;

    const trendPoints: LinePoint[] = allSubs
      .slice()
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))
      .flatMap((s) => {
        const t = testById.get(s.testId);
        if (!t) return [];
        return [{ label: s.submittedAt ? shortDay(s.submittedAt) : "", value: gradeSubmission(t, s).percent }];
      });

    const perTest: StudentPerTest[] = curSubs
      .flatMap((s) => {
        const t = testById.get(s.testId);
        if (!t) return [];
        return [{ test: t, result: gradeSubmission(t, s) }];
      })
      .sort((a, b) => b.result.percent - a.result.percent);

    const mastery = topicMastery(base.relevantTests, curSubs);
    // Out of the tests set for this student that have opened (their class and
    // subject, since they joined), not every test in the portal.
    const theirs = testsForStudent(db, student).filter((t) => base.relevantTestIds.has(t.id) && +new Date(t.opensAt) <= nowMs);
    const done = new Set(db.submissions.filter((x) => x.studentId === student.id && x.status !== "in_progress").map((x) => x.testId));
    const total = theirs.length;
    const completed = theirs.filter((t) => done.has(t.id)).length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { student, avg, delta, grade, trendPoints, perTest, mastery, completionPct, completed, total };
  }, [base, monthSubs, prevMonthSubs, testById, selectedStudentId, db, nowMs]);

  const scopeCohort = cohortId ? cohortById(db, cohortId) : null;
  const hasData = base.released.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader title="Analytics" subtitle={scopeCohort ? `Filtered to ${scopeCohort.name}` : "All cohorts"} />

      {/* Controls row */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(["class", "student"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                "min-h-10 rounded-md px-4 text-sm font-semibold transition-colors",
                view === v ? "bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-ink-3 hover:text-ink",
              )}
            >
              {v === "class" ? "Class view" : "Student view"}
            </button>
          ))}
        </div>

        <select
          aria-label="Month"
          value={selectedMonth === "all" ? "all" : activeMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {base.allMonths.length > 1 && <option value="all">All time</option>}
          {base.allMonths.map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>

        {view === "student" && (
          <select
            aria-label="Student"
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="h-11 min-w-0 flex-1 basis-48 rounded-lg border border-border bg-surface px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Pick a student</option>
            {base.students.map((s) => (
              <option key={s.id} value={s.id}>{s.username}</option>
            ))}
          </select>
        )}
      </div>

      {!hasData ? (
        <EmptyState icon={<Icon.Chart />} title="No released results yet" message="Release some results to see analytics." />
      ) : view === "class" ? (
        <ClassView data={classData} db={db} prevMonth={prevMonth} activeMonth={activeMonth} />
      ) : !studentData ? (
        <EmptyState icon={<Icon.Chart />} title="Pick a student" message="Choose a student from the dropdown above." />
      ) : (
        <StudentView data={studentData} db={db} monthLabel={formatMonth(activeMonth)} />
      )}
    </div>
  );
}

// ---- Class View -----------------------------------------------------------

function ClassView({
  data,
  db,
  prevMonth,
  activeMonth,
}: {
  data: ClassViewData;
  db: ReturnType<typeof useDatabase>;
  prevMonth: string;
  activeMonth: string;
}) {
  const monthLabel = activeMonth ? formatMonth(activeMonth).split(" ")[0] : "All time";

  return (
    <div className="space-y-5">
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", data.attendanceAvg != null ? "xl:grid-cols-6" : "lg:grid-cols-5")}>
        <MetricCard label="All-time average" value={`${data.overall}%`} />
        <MetricCard label={`Average (${monthLabel})`} value={`${data.monthly}%`} delta={data.delta} />
        <MetricCard label={`A/A* (${monthLabel})`} value={String(data.topStudents)} note="students" />
        <MetricCard label="Needs support" value={String(data.strugglingStudents)} note="students at E or U" />
        <MetricCard label="Waiting to be marked" value={String(data.toMark)} note="scripts" />
        {data.attendanceAvg != null && (
          <MetricCard label="Attendance" value={`${data.attendanceAvg}%`} note={`${activeMonth ? monthLabel : "This month"} average`} />
        )}
      </div>

      {data.trendPoints.length >= 2 && (
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Class average trend</h2>
          <LineChart points={data.trendPoints} height={160} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Grade distribution</h2>
          <BarChart bars={data.bars} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Weak topics</h2>
          <div className="space-y-3.5">
            {(() => {
              // Below 70% only: 70% and up is Strong, so it does not belong here.
              const weak = data.mastery.filter((m) => m.percent < 70);
              if (data.mastery.length === 0) return <p className="text-sm text-ink-3">No graded topics yet.</p>;
              if (weak.length === 0) return <p className="text-sm text-ink-3">Every topic is at 70% or above.</p>;
              return weak.slice(0, 6).map((m) => (
                <MasteryBar
                  key={m.topic}
                  // Two questions are not enough to call a topic weak: say so.
                  topic={m.available < SMALL_SAMPLE_MARKS ? `${m.topic} (only ${m.available} mark${m.available === 1 ? "" : "s"} so far)` : m.topic}
                  percent={m.percent}
                  band={m.band}
                />
              ));
            })()}
          </div>
        </Card>

        {prevMonth && (
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Most improved</h2>
            {data.improved.length === 0 ? (
              <p className="text-sm text-ink-3">No comparable data yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.improved.map(({ student, curAvg, delta }) => {
                  const cohort = cohortById(db, student.cohortId);
                  return (
                    <li key={student.id}>
                      <Link href={`/admin/roster/${student.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize text-ink">{student.username}</p>
                          {cohort && <p className="flex items-center gap-1 text-xs text-ink-3"><CohortDot color={cohort.color} />{cohort.name}</p>}
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-ink">{curAvg}%</span>
                        <Badge tone="success">+{delta}%</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {prevMonth && (
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-ink">Needs attention</h2>
            {data.slipping.length === 0 ? (
              <p className="text-sm text-ink-3">No notable drops this month.</p>
            ) : (
              <ul className="space-y-2">
                {data.slipping.map(({ student, curAvg, delta }) => {
                  const cohort = cohortById(db, student.cohortId);
                  return (
                    <li key={student.id}>
                      <Link href={`/admin/roster/${student.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize text-ink">{student.username}</p>
                          {cohort && <p className="flex items-center gap-1 text-xs text-ink-3"><CohortDot color={cohort.color} />{cohort.name}</p>}
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-ink">{curAvg}%</span>
                        <Badge tone="error">{delta}%</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Per-test stats</h2>
        </div>
        <TableScroll>
          <Table stickyFirst>
            <thead>
              <tr><Th>Test</Th><Th>Subject</Th><Th>Results</Th><Th>Average</Th><Th>Top grade</Th></tr>
            </thead>
            <tbody>
              {data.perTest.length === 0 && (
                <tr><td colSpan={5} className="border-b border-border px-3 py-3.5 text-sm text-ink-3">No results {activeMonth ? `in ${formatMonth(activeMonth)}` : "yet"}.</td></tr>
              )}
              {data.perTest.map(({ test, count, avg, top, pending }) => (
                <tr key={test.id}>
                  <Td className="font-semibold">{test.title}</Td>
                  <Td className="text-ink-2">{test.subject}</Td>
                  <Td className="tabular-nums">{count}</Td>
                  <Td className="tabular-nums">
                    {avg != null ? (
                      `${avg}%`
                    ) : pending > 0 ? (
                      <span className="text-warning">{pending} to mark</span>
                    ) : (
                      <span className="text-ink-3">None</span>
                    )}
                  </Td>
                  <Td>{top ? <Badge tone={gradeRole(top)}>{top}</Badge> : <span className="text-ink-3">None</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </Card>

      {data.cohortCompletion.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Completion by cohort</h2>
          </div>
          <ul className="divide-y divide-border">
            {data.cohortCompletion.map(({ cohort, pct, submitted, expected }) => (
              <li key={cohort.id} className="flex items-center gap-3 px-5 py-3">
                <CohortDot color={cohort.color} />
                <span className="flex-1 text-sm font-semibold text-ink">{cohort.name}</span>
                <span className="text-sm tabular-nums text-ink-2">{submitted}/{expected}</span>
                <Badge tone={pct >= 75 ? "success" : pct >= 50 ? "warning" : "error"}>{pct}%</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---- Student View ---------------------------------------------------------

function StudentView({
  data,
  db,
  monthLabel,
}: {
  data: StudentViewData;
  db: ReturnType<typeof useDatabase>;
  monthLabel: string;
}) {
  const cohortName = cohortById(db, data.student.cohortId)?.name ?? null;
  const reportTests = data.perTest.map(({ test, result }) => ({
    title: test.title,
    subject: test.subject,
    percent: result.percent,
    letter: result.letter,
  }));

  return (
    <StudentReport
      studentName={data.student.username}
      cohortName={cohortName}
      monthLabel={monthLabel}
      grade={data.grade}
      averagePct={data.avg}
      deltaPct={data.delta}
      completion={{ pct: data.completionPct, done: data.completed, total: data.total }}
      trend={data.trendPoints}
      tests={reportTests}
    />
  );
}

// ---- Shared UI ------------------------------------------------------------

function MetricCard({
  label, value, delta, note, tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  note?: string;
  tone?: "success" | "warning" | "error";
}) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "error" ? "text-error" : "text-ink";
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className={cn("mt-1 text-[1.75rem] font-semibold leading-tight tabular-nums tracking-[-0.02em]", toneClass)}>{value}</p>
      {delta != null && (
        <p className={cn("mt-0.5 text-xs font-semibold tabular-nums", delta > 0 ? "text-success" : delta < 0 ? "text-error" : "text-ink-3")}>
          {delta > 0 ? "+" : ""}{delta}% vs last month
        </p>
      )}
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
    </Card>
  );
}
