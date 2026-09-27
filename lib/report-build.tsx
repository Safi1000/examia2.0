"use client";

import type { Database } from "@/lib/data/seed";
import {
  attendancePercent,
  cohortById,
  studentById,
  submissionsForStudent,
  testById,
  testsForStudent,
} from "@/lib/data/selectors";
import { gradeLetter, gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";

/**
 * Builds a student's monthly report PDF.
 *
 * Shared by the student page and the batch "send monthly reports" run, so both
 * produce exactly the same document. `@react-pdf` (a 1.4 MB chunk) and the
 * document itself are imported on demand — importing them at module scope would
 * put the whole renderer back into every page that merely links here.
 */

const monthOf = (iso: string | null | undefined): string => (iso ? iso.slice(0, 7) : "");

export interface BuiltReport {
  blob: Blob;
  fileName: string;
  /** The month it covers, as YYYY-MM ("" for all-time). */
  month: string;
}

export async function buildStudentReport(
  db: Database,
  studentId: string,
  month: string,
  teacherNote = "",
): Promise<BuiltReport | null> {
  const student = studentById(db, studentId);
  if (!student) return null;

  const [{ pdf }, { ReportDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/ReportDocument"),
  ]);

  const cohort = cohortById(db, student.cohortId);
  const allReleased = submissionsForStudent(db, student.id).filter((s) => s.status === "released");

  const prevMonthDate = month
    ? (() => {
        const [y, mo] = month.split("-").map(Number);
        return new Date(y, mo - 2, 1);
      })()
    : null;
  const prevMonth = prevMonthDate
    ? `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`
    : "";

  const monthSubs = month ? allReleased.filter((s) => monthOf(s.submittedAt) === month) : allReleased;
  const prevSubs = prevMonth ? allReleased.filter((s) => monthOf(s.submittedAt) === prevMonth) : [];

  const calcAvg = (subs: typeof allReleased) => {
    if (!subs.length) return null;
    const sum = subs.reduce((a, s) => {
      const t = testById(db, s.testId);
      return t ? a + gradeSubmission(t, s).percent : a;
    }, 0);
    return Math.round((sum / subs.length) * 10) / 10;
  };

  const monthAvg = calcAvg(monthSubs);
  const prevAvg = calcAvg(prevSubs);
  const delta = monthAvg != null && prevAvg != null ? Math.round((monthAvg - prevAvg) * 10) / 10 : null;
  const grade = monthAvg != null ? gradeLetter(monthAvg) : null;

  // Trend: this month plus up to two prior months.
  const relevantMonths = month
    ? (() => {
        const [y, mo] = month.split("-").map(Number);
        return [-2, -1, 0].map((offset) => {
          const d = new Date(y, mo - 1 + offset, 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        });
      })()
    : Array.from(new Set(allReleased.map((s) => monthOf(s.submittedAt)))).sort().slice(-3);

  const trendMonths = relevantMonths.flatMap((m) => {
    const subs = allReleased.filter((s) => monthOf(s.submittedAt) === m);
    if (!subs.length) return [];
    const a = calcAvg(subs);
    return a != null ? [{ label: m.slice(5), value: a }] : [];
  });

  const perTest = monthSubs
    .flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ test: { title: t.title, subject: t.subject }, result: gradeSubmission(t, s) }];
    })
    .sort((a, b) => b.result.percent - a.result.percent);

  const allTests = allReleased.flatMap((s) => {
    const t = testById(db, s.testId);
    return t ? [t] : [];
  });
  const mastery = topicMastery(allTests, monthSubs);

  const available = testsForStudent(db, student).filter((t) => t.status !== "draft");
  const completionPct = available.length > 0 ? Math.round((allReleased.length / available.length) * 100) : 0;

  const attendancePct = month ? attendancePercent(db, student.id, `${month}-01`) : null;

  // Tests set in that month with nothing handed in — named, so a parent can see
  // exactly what was missed.
  const handedIn = new Set(submissionsForStudent(db, student.id).map((x) => x.testId));
  const missedTests = available
    .filter((t) => (month ? (t.closesAt ?? "").slice(0, 7) === month : true))
    .filter((t) => !handedIn.has(t.id))
    .map((t) => t.title);

  // Average and grade per subject for the month.
  const bySubject = new Map<string, number[]>();
  for (const r of perTest) {
    const list = bySubject.get(r.test.subject) ?? [];
    list.push(r.result.percent);
    bySubject.set(r.test.subject, list);
  }
  const perSubject = Array.from(bySubject.entries()).map(([subject, values]) => {
    const pct = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    return { subject, percent: pct, letter: gradeLetter(pct) };
  });

  const blob = await pdf(
    <ReportDocument
      studentName={student.username}
      cohortName={cohort?.name}
      month={month}
      monthAvg={monthAvg}
      prevAvg={prevAvg}
      delta={delta}
      grade={grade}
      trendMonths={trendMonths}
      perTest={perTest}
      mastery={mastery}
      completionPct={completionPct}
      completed={allReleased.length}
      available={available.length}
      attendancePct={attendancePct}
      missedTests={missedTests}
      perSubject={perSubject}
      teacherNote={teacherNote}
    />,
  ).toBlob();

  const safeName = student.username.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return { blob, fileName: `report-${safeName}-${month || "all"}.pdf`, month };
}
