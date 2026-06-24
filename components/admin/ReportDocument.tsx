"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { GradeLetter } from "@/lib/grading";
import type { TopicMastery } from "@/lib/scoring";
import type { Test } from "@/types";
import type { GradeResult } from "@/lib/grading";

// Use built-in fonts (no external fetch needed in client-side PDF)
const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FAF8F4",
    paddingHorizontal: 48,
    paddingVertical: 40,
    fontFamily: "Times-Roman",
    color: "#1a1d20",
    fontSize: 12,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 3,
    borderBottomColor: "#c59a3c",
    paddingBottom: 16,
    marginBottom: 24,
  },
  company: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: "#c59a3c",
    marginBottom: 5,
  },
  reportTitle: {
    fontSize: 22,
    fontFamily: "Times-Bold",
    color: "#1a1d20",
  },
  reportSubtitle: {
    fontSize: 11,
    color: "#4a4a4a",
    marginTop: 3,
  },
  studentName: {
    fontSize: 13,
    fontFamily: "Times-Bold",
    textAlign: "right",
  },
  cohortName: {
    fontSize: 11,
    color: "#4a4a4a",
    textAlign: "right",
    marginTop: 2,
  },
  // Section
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    color: "#c59a3c",
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e2d8",
    paddingBottom: 5,
    marginBottom: 10,
    marginTop: 20,
  },
  // Headline stats row
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8e2d8",
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    color: "#888888",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  statValue: {
    fontSize: 26,
    fontFamily: "Times-Bold",
    color: "#1a1d20",
    lineHeight: 1,
  },
  statSub: {
    fontSize: 9,
    color: "#888888",
    marginTop: 3,
  },
  // Table
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#c59a3c",
    paddingBottom: 5,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e2d8",
    paddingVertical: 6,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e2d8",
    paddingVertical: 6,
    backgroundColor: "#f5f2ec",
  },
  colTest: { flex: 3 },
  colSubject: { flex: 2 },
  colScore: { flex: 1, textAlign: "right" },
  colGrade: { flex: 1, textAlign: "right" },
  colHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#888888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colText: { fontSize: 11, color: "#1a1d20" },
  colTextMid: { fontSize: 11, color: "#4a4a4a" },
  colTextMono: { fontSize: 11, fontFamily: "Courier", color: "#1a1d20" },
  // Mastery bars
  masteryRow: {
    marginBottom: 8,
  },
  masteryLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  masteryTopic: { fontSize: 11, color: "#1a1d20" },
  masteryPct: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  masteryTrack: {
    height: 5,
    backgroundColor: "#e8e2d8",
    borderRadius: 3,
  },
  // Body text
  bodyText: { fontSize: 11, color: "#4a4a4a", lineHeight: 1.5 },
  // Note box
  noteBox: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8e2d8",
    borderRadius: 5,
    padding: 12,
    minHeight: 60,
  },
  noteText: { fontSize: 11, color: "#1a1d20", lineHeight: 1.5 },
  notePlaceholder: { fontSize: 11, color: "#aaaaaa", fontFamily: "Times-Italic" },
  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e8e2d8",
    paddingTop: 10,
    marginTop: 28,
  },
  footerText: { fontSize: 9, color: "#aaaaaa" },
});

const GRADE_COLORS: Partial<Record<GradeLetter, string>> = {
  "A*": "#16a34a",
  A: "#16a34a",
  B: "#15803d",
  C: "#ca8a04",
  D: "#d97706",
  E: "#dc2626",
  U: "#991b1b",
};

function masteryColor(band: TopicMastery["band"]) {
  return band === "mastery" ? "#16a34a" : band === "weak" ? "#ca8a04" : "#dc2626";
}

function formatMonthLabel(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

export interface ReportDocumentProps {
  studentName: string;
  cohortName: string | undefined;
  month: string;
  monthAvg: number | null;
  prevAvg: number | null;
  delta: number | null;
  grade: GradeLetter | null;
  trendMonths: Array<{ label: string; value: number }>;
  perTest: Array<{ test: Pick<Test, "title" | "subject">; result: GradeResult }>;
  mastery: TopicMastery[];
  completionPct: number;
  completed: number;
  available: number;
  teacherNote: string;
}

export function ReportDocument({
  studentName,
  cohortName,
  month,
  monthAvg,
  prevAvg,
  delta,
  grade,
  trendMonths,
  perTest,
  mastery,
  completionPct,
  completed,
  available,
  teacherNote,
}: ReportDocumentProps) {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const deltaSign = (delta ?? 0) > 0 ? "+" : "";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.company}>HAMZA TEACHES</Text>
            <Text style={styles.reportTitle}>Monthly Progress Report</Text>
            <Text style={styles.reportSubtitle}>{formatMonthLabel(month)}</Text>
          </View>
          <View>
            <Text style={styles.studentName}>{studentName}</Text>
            {cohortName && <Text style={styles.cohortName}>{cohortName}</Text>}
          </View>
        </View>

        {/* Headline stats */}
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Average score</Text>
            <Text style={styles.statValue}>{monthAvg != null ? `${monthAvg}%` : "—"}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Grade</Text>
            <Text style={[styles.statValue, { color: grade ? (GRADE_COLORS[grade] ?? "#1a1d20") : "#1a1d20" }]}>
              {grade ?? "—"}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{delta != null ? "vs last month" : "Completion"}</Text>
            <Text style={[styles.statValue, {
              color: delta != null ? (delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : "#1a1d20") : "#1a1d20",
              fontSize: 20,
            }]}>
              {delta != null ? `${deltaSign}${delta}%` : `${completionPct}%`}
            </Text>
            {prevAvg != null && (
              <Text style={styles.statSub}>Previous: {prevAvg}%</Text>
            )}
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Completion</Text>
            <Text style={[styles.statValue, { fontSize: 20 }]}>{completionPct}%</Text>
            <Text style={styles.statSub}>{completed}/{available} tests</Text>
          </View>
        </View>

        {/* Score trend (text table instead of chart) */}
        {trendMonths.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Score Trend</Text>
            <View style={styles.tableHeader}>
              <View style={{ flex: 2 }}><Text style={styles.colHeaderText}>Month</Text></View>
              <View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.colHeaderText}>Average</Text></View>
            </View>
            {trendMonths.map((pt, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.colText}>
                    {pt.label ? (() => {
                      const [mo, day] = pt.label.split("-");
                      const d = new Date(2000, Number(mo) - 1, 1);
                      return d.toLocaleString("default", { month: "long" });
                    })() : "—"}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.colTextMono}>{pt.value}%</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Test breakdown */}
        {perTest.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Test Breakdown</Text>
            <View style={styles.tableHeader}>
              <View style={styles.colTest}><Text style={styles.colHeaderText}>Test</Text></View>
              <View style={styles.colSubject}><Text style={styles.colHeaderText}>Subject</Text></View>
              <View style={styles.colScore}><Text style={[styles.colHeaderText, { textAlign: "right" }]}>Score</Text></View>
              <View style={styles.colGrade}><Text style={[styles.colHeaderText, { textAlign: "right" }]}>Grade</Text></View>
            </View>
            {perTest.map(({ test, result }, i) => (
              <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                <View style={styles.colTest}><Text style={styles.colText}>{test.title}</Text></View>
                <View style={styles.colSubject}><Text style={styles.colTextMid}>{test.subject}</Text></View>
                <View style={styles.colScore}><Text style={[styles.colTextMono, { textAlign: "right" }]}>{result.percent}%</Text></View>
                <View style={styles.colGrade}>
                  <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right", color: GRADE_COLORS[result.letter] ?? "#1a1d20" }}>
                    {result.letter}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Topic mastery */}
        {mastery.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Topic Mastery</Text>
            {mastery.map((m) => (
              <View key={m.topic} style={styles.masteryRow}>
                <View style={styles.masteryLabel}>
                  <Text style={styles.masteryTopic}>{m.topic}</Text>
                  <Text style={[styles.masteryPct, { color: masteryColor(m.band) }]}>{Math.round(m.percent)}%</Text>
                </View>
                {/* Progress bar as a filled rectangle */}
                <View style={styles.masteryTrack}>
                  <View style={{ height: 5, width: `${m.percent}%`, backgroundColor: masteryColor(m.band), borderRadius: 3 }} />
                </View>
              </View>
            ))}
          </>
        )}

        {/* Teacher note */}
        <Text style={styles.sectionTitle}>Teacher's Note</Text>
        <View style={styles.noteBox}>
          {teacherNote ? (
            <Text style={styles.noteText}>{teacherNote}</Text>
          ) : (
            <Text style={styles.notePlaceholder}>No note added.</Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Hamza Teaches — Confidential</Text>
          <Text style={styles.footerText}>Generated {today}</Text>
        </View>
      </Page>
    </Document>
  );
}
