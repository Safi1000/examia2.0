"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useDataReady } from "@/lib/data/store";
import { cohortById, studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { gradeLetter, gradeRole, gradeSubmission, GRADE_ORDER } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { COMPANY_NAME } from "@/lib/config";

function monthOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 7) : "";
}

function formatMonthLabel(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

const cream = "#FAF8F4";
const gold = "#c59a3c";
const dark = "#1a1d20";
const mid = "#4a4a4a";
const light = "#888";
const border = "#e8e2d8";

export default function ReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id);
  const month = searchParams.get("month") ?? "";
  const note = searchParams.get("note") ?? "";

  const { session } = useAuth();
  const ready = useDataReady();
  const db = useDatabase();

  const isAdmin = session?.role === "admin";

  const data = useMemo(() => {
    const student = studentById(db, id);
    if (!student) return null;

    const allReleased = submissionsForStudent(db, student.id)
      .filter((s) => s.status === "released")
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

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

    function avg(subs: typeof allReleased) {
      if (!subs.length) return null;
      const sum = subs.reduce((a, s) => {
        const t = testById(db, s.testId);
        return t ? a + gradeSubmission(t, s).percent : a;
      }, 0);
      return Math.round((sum / subs.length) * 10) / 10;
    }

    const monthAvg = avg(monthSubs);
    const prevAvg = avg(prevSubs);
    const delta = monthAvg != null && prevAvg != null ? Math.round((monthAvg - prevAvg) * 10) / 10 : null;
    const grade = monthAvg != null ? gradeLetter(monthAvg) : null;

    // Score trend (month + 2 prior months for context)
    const relevantMonths = month
      ? (() => {
          const [y, mo] = month.split("-").map(Number);
          return [-2, -1, 0].map((offset) => {
            const d = new Date(y, mo - 1 + offset, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          });
        })()
      : Array.from(new Set(allReleased.map((s) => monthOf(s.submittedAt)))).sort().slice(-3);

    const trendPoints: LinePoint[] = relevantMonths.flatMap((m) => {
      const subs = allReleased.filter((s) => monthOf(s.submittedAt) === m);
      if (!subs.length) return [];
      const a = avg(subs);
      return a != null ? [{ label: m.slice(5), value: a }] : [];
    });

    // Test breakdown for month
    const perTest = monthSubs.flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ test: t, result: gradeSubmission(t, s) }];
    }).sort((a, b) => b.result.percent - a.result.percent);

    // Topic mastery
    const tests = allReleased.flatMap((s) => { const t = testById(db, s.testId); return t ? [t] : []; });
    const mastery = topicMastery(tests, monthSubs);

    // Completion
    const available = testsForStudent(db, student).filter((t) => t.status !== "draft");
    const completionPct = available.length > 0 ? Math.round((allReleased.length / available.length) * 100) : 0;

    const cohort = cohortById(db, student.cohortId);

    return { student, cohort, monthAvg, prevAvg, delta, grade, trendPoints, perTest, mastery, completionPct, available: available.length, completed: allReleased.length };
  }, [db, id, month]);

  if (!ready) {
    return <div style={{ padding: 40, color: dark }}>Loading...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: 40, color: dark }}>Access denied.</div>;
  }

  if (!data) {
    return <div style={{ padding: 40, color: dark }}>Student not found.</div>;
  }

  const { student, cohort, monthAvg, prevAvg, delta, grade, trendPoints, perTest, mastery, completionPct, available, completed } = data;

  const gradeColors: Record<string, string> = { A: "#16a34a", "A*": "#16a34a", B: "#15803d", C: "#ca8a04", D: "#d97706", E: "#dc2626", U: "#991b1b" };

  return (
    <>
      {/* Print trigger button — hidden on print */}
      <div
        className="print:hidden"
        style={{ background: dark, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span style={{ color: "#ffffff", fontWeight: 700 }}>{COMPANY_NAME} — Monthly Report</span>
        <button
          onClick={() => window.print()}
          style={{ background: gold, color: dark, border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Report body */}
      <div
        id="report"
        style={{
          background: cream,
          minHeight: "100vh",
          padding: "40px 48px",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: dark,
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: `3px solid ${gold}`, paddingBottom: 20, marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: gold, textTransform: "uppercase", margin: 0 }}>
                {COMPANY_NAME}
              </p>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 0", color: dark }}>Monthly Progress Report</h1>
              <p style={{ margin: "4px 0 0", fontSize: 14, color: mid }}>{formatMonthLabel(month)}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: dark, textTransform: "capitalize" }}>{student.username}</p>
              {cohort && <p style={{ margin: "2px 0 0", fontSize: 13, color: mid }}>{cohort.name}</p>}
            </div>
          </div>
        </div>

        {/* Headline stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
          <HeadlineStat label="Average score" value={monthAvg != null ? `${monthAvg}%` : "—"} />
          <HeadlineStat
            label="Grade"
            value={grade ?? "—"}
            valueColor={grade ? (gradeColors[grade] ?? dark) : undefined}
          />
          <HeadlineStat
            label={prevAvg != null ? "vs last month" : "Completion"}
            value={
              delta != null
                ? `${delta > 0 ? "+" : ""}${delta}%`
                : `${completionPct}%`
            }
            valueColor={delta != null ? (delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : dark) : undefined}
            sub={prevAvg != null ? `Previous: ${prevAvg}%` : `${completed}/${available} tests`}
          />
        </div>

        {/* Score trend */}
        {trendPoints.length > 0 && (
          <Section title="Score Trend">
            <div style={{ background: "#ffffff", borderRadius: 8, border: `1px solid ${border}`, padding: "12px 8px 4px" }}>
              <LineChart points={trendPoints} height={130} />
            </div>
            <p style={{ fontSize: 11, color: light, marginTop: 4 }}>Monthly class averages — this month and prior context.</p>
          </Section>
        )}

        {/* Test breakdown */}
        {perTest.length > 0 && (
          <Section title="Test Breakdown">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${gold}` }}>
                  <Th>Test</Th>
                  <Th>Subject</Th>
                  <Th align="right">Score</Th>
                  <Th align="right">Grade</Th>
                </tr>
              </thead>
              <tbody>
                {perTest.map(({ test, result }, i) => (
                  <tr key={test.id} style={{ borderBottom: `1px solid ${border}`, background: i % 2 === 0 ? "transparent" : "#f5f2ec" }}>
                    <td style={{ padding: "8px 6px", color: dark, fontWeight: 500 }}>{test.title}</td>
                    <td style={{ padding: "8px 6px", color: mid }}>{test.subject}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "monospace", color: dark }}>{result.percent}%</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, color: gradeColors[result.letter] ?? dark }}>{result.letter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Topic mastery */}
        {mastery.length > 0 && (
          <Section title="Topic Mastery">
            {mastery.map((m) => (
              <div key={m.topic} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: dark }}>{m.topic}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: m.band === "mastery" ? "#16a34a" : m.band === "weak" ? "#ca8a04" : "#dc2626" }}>
                    {Math.round(m.percent)}%
                  </span>
                </div>
                <div style={{ height: 6, background: "#e8e2d8", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${m.percent}%`, background: m.band === "mastery" ? "#16a34a" : m.band === "weak" ? "#ca8a04" : "#dc2626", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Completion */}
        <Section title="Completion">
          <p style={{ fontSize: 14, color: mid }}>
            {completed} of {available} available tests completed ({completionPct}%).
          </p>
        </Section>

        {/* Teacher note */}
        <Section title="Teacher's Note">
          <div style={{ minHeight: 80, background: "#fff", border: `1px solid ${border}`, borderRadius: 6, padding: "12px 16px", fontSize: 14, color: note ? dark : light, fontStyle: note ? "normal" : "italic" }}>
            {note || "No note added."}
          </div>
        </Section>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${border}`, marginTop: 36, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
          <p style={{ fontSize: 11, color: light, margin: 0 }}>{COMPANY_NAME} — Confidential</p>
          <p style={{ fontSize: 11, color: light, margin: 0 }}>Generated {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <style>{`
        @media print {
          body { background: ${cream} !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: gold, margin: "0 0 12px", borderBottom: `1px solid ${border}`, paddingBottom: 6 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function HeadlineStat({ label, value, valueColor, sub }: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${border}`, borderRadius: 8, padding: "16px", textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: light }}>{label}</p>
      <p style={{ margin: "8px 0 0", fontSize: 30, fontWeight: 700, color: valueColor ?? dark, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 11, color: light }}>{sub}</p>}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th style={{ padding: "6px", textAlign: align ?? "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: light }}>
      {children}
    </th>
  );
}
