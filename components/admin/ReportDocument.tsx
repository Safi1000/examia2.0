"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Circle,
  Polyline,
  Rect,
  Line,
} from "@react-pdf/renderer";
import type { GradeLetter, GradeResult } from "@/lib/grading";
import type { Test } from "@/types";

// A4: 595 × 842 pt. Padding 45 each side → content 505pt.
const W = 595;
const CONTENT_W = 505;
const PAD = 45;
const FRAME_INSET = 13;

const BG     = "#17191b";
const INK    = "#ECE7DD";
const MUT    = "#8f897b";
const GOLD   = "#C9A24B";
const RED    = "#c0402e";
const HAIR   = "rgba(255,255,255,0.09)";

const styles = StyleSheet.create({
  page: {
    backgroundColor: BG,
    paddingHorizontal: PAD,
    paddingVertical: 42,
    fontFamily: "Helvetica",
    color: INK,
    fontSize: 11,
    position: "relative",
  },

  // ── Masthead ─────────────────────────────────────────────
  mast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2.5,
    color: GOLD,
  },
  confidential: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2.5,
    color: RED,
    borderWidth: 1,
    borderColor: "rgba(192,64,46,0.55)",
    backgroundColor: "rgba(192,64,46,0.10)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  // ── Report label + name ──────────────────────────────────
  reportLabel: {
    fontSize: 9,
    fontFamily: "Helvetica",
    letterSpacing: 1.5,
    color: MUT,
    marginTop: 34,
    marginBottom: 7,
  },
  studentName: {
    fontSize: 34,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
    color: INK,
    lineHeight: 1.05,
  },
  cohortLine: {
    fontSize: 11,
    color: MUT,
    marginTop: 10,
  },

  // ── Stats ────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row",
    marginTop: 36,
  },
  stat: {
    flex: 1,
    paddingRight: 20,
  },
  statBorder: {
    flex: 1,
    paddingLeft: 20,
    paddingRight: 20,
    borderLeftWidth: 1,
    borderLeftColor: HAIR,
  },
  statLast: {
    flex: 1,
    paddingLeft: 20,
    borderLeftWidth: 1,
    borderLeftColor: HAIR,
  },
  statLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.8,
    color: MUT,
    marginBottom: 10,
  },
  gradeValue: {
    fontSize: 52,
    fontFamily: "Helvetica-Bold",
    color: GOLD,
    lineHeight: 1,
  },
  avgValue: {
    fontSize: 38,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1,
  },
  compValue: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1,
  },
  compSub: {
    fontSize: 10,
    color: MUT,
    marginTop: 7,
  },

  // ── Section heading ──────────────────────────────────────
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: MUT,
    marginBottom: 6,
  },
  sectionCap: {
    fontSize: 9.5,
    color: MUT,
    marginBottom: 14,
  },

  // ── Test table ───────────────────────────────────────────
  trow: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: HAIR,
  },
  trowFirst: {
    borderTopWidth: 1,
    borderTopColor: HAIR,
  },
  tname: { flex: 1, fontSize: 13, fontFamily: "Helvetica-Bold", color: INK },
  tsub: { flex: 1, fontSize: 11, color: MUT },
  tscore: { width: 64, textAlign: "right", fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  tgrade: { width: 44, textAlign: "right", fontSize: 12, fontFamily: "Helvetica-Bold", color: GOLD },

  // ── Teacher note ─────────────────────────────────────────
  noteWrap: {
    flexDirection: "row",
    marginTop: 4,
  },
  noteBar: {
    width: 2,
    backgroundColor: GOLD,
    marginRight: 14,
    borderRadius: 1,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: INK,
    lineHeight: 1.6,
  },
  notePlaceholder: {
    flex: 1,
    fontSize: 12,
    color: MUT,
    fontFamily: "Helvetica-Oblique",
  },

  // ── Footer ───────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 13,
    marginTop: "auto",
  },
  footerText: {
    fontSize: 8,
    color: MUT,
    letterSpacing: 0.8,
  },
});

function formatMonthFull(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

// SVG line chart — one dot per test, gold labels above each dot
function TrendChart({ tests }: { tests: Array<{ result: { percent: number } }> }) {
  if (!tests.length) return null;

  const CW = CONTENT_W;
  const CH = 110;
  const px = 10;
  const pyTop = 28; // room for % labels above dots
  const pyBot = 10;
  const innerW = CW - px * 2;
  const innerH = CH - pyTop - pyBot;

  const vals = tests.map((t) => t.result.percent);
  const single = vals.length === 1;
  const lo = Math.max(0, Math.min(...vals) - 12);
  const hi = Math.min(100, Math.max(...vals) + 12);
  const range = hi - lo || 20;

  const cx = (i: number) =>
    px + (single ? innerW / 2 : (i / (vals.length - 1)) * innerW);
  const cy = (v: number) =>
    pyTop + innerH - ((v - lo) / range) * innerH;

  const lineStr = vals.map((v, i) => `${cx(i)},${cy(v)}`).join(" ");

  // Grid lines at 0, 50, 100
  const gridVals = [0, 50, 100].filter((g) => g >= lo && g <= hi);

  return (
    <Svg width={CW} height={CH}>
      {/* Grid */}
      {gridVals.map((g) => (
        <Line
          key={g}
          x1={px - 6}
          y1={cy(g)}
          x2={CW - px + 6}
          y2={cy(g)}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={1}
        />
      ))}
      {/* Line */}
      {!single && (
        <Polyline
          points={lineStr}
          stroke={GOLD}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Dots */}
      {vals.map((v, i) => (
        <Circle
          key={i}
          cx={cx(i)}
          cy={cy(v)}
          r={5}
          fill={GOLD}
          stroke={BG}
          strokeWidth={2.5}
        />
      ))}
      {/* Score labels above dots */}
      {vals.map((v, i) => (
        <Rect
          key={`lbl-${i}`}
          x={cx(i) - 16}
          y={cy(v) - 22}
          width={32}
          height={16}
          fill="transparent"
        />
      ))}
    </Svg>
  );
}

// Score labels rendered as Text below SVG (SVG Text support is limited in react-pdf)
function TrendLabels({ tests }: { tests: Array<{ result: { percent: number } }> }) {
  if (!tests.length) return null;
  const single = tests.length === 1;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: -6, paddingHorizontal: 6 }}>
      {tests.map((t, i) => {
        const leftPct = single ? 50 : (i / (tests.length - 1)) * 100;
        void leftPct;
        return (
          <Text key={i} style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: GOLD, textAlign: "center", flex: 1 }}>
            {t.result.percent}%
          </Text>
        );
      })}
    </View>
  );
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
  mastery: Array<{ topic: string; percent: number; band: string }>;
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
  grade,
  perTest,
  completionPct,
  completed,
  available,
  teacherNote,
}: ReportDocumentProps) {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).toUpperCase();

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Frame border */}
        <Svg
          width={W}
          height={842}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <Rect
            x={FRAME_INSET}
            y={FRAME_INSET}
            width={W - FRAME_INSET * 2}
            height={842 - FRAME_INSET * 2}
            fill="none"
            stroke="rgba(201,162,75,0.22)"
            strokeWidth={1}
          />
        </Svg>

        {/* Masthead */}
        <View style={styles.mast}>
          <Text style={styles.eyebrow}>HAMZA TEACHES</Text>
          <Text style={styles.confidential}>CONFIDENTIAL</Text>
        </View>

        {/* Hair divider */}
        <Svg width={CONTENT_W} height={1} style={{ marginBottom: 0 }}>
          <Line x1={0} y1={0} x2={CONTENT_W} y2={0} stroke={HAIR} strokeWidth={1} />
        </Svg>

        {/* Report label + student name */}
        <Text style={styles.reportLabel}>
          MONTHLY PROGRESS REPORT{"  ·  "}{formatMonthFull(month).toUpperCase()}
        </Text>
        <Text style={styles.studentName}>{studentName}</Text>
        {cohortName && (
          <Text style={styles.cohortLine}>Cohort {cohortName}</Text>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>GRADE</Text>
            <Text style={styles.gradeValue}>{grade ?? "—"}</Text>
          </View>
          <View style={styles.statBorder}>
            <Text style={styles.statLabel}>AVERAGE</Text>
            <Text style={styles.avgValue}>{monthAvg != null ? `${monthAvg}%` : "—"}</Text>
          </View>
          <View style={styles.statLast}>
            <Text style={styles.statLabel}>COMPLETION</Text>
            <Text style={styles.compValue}>{completionPct}%</Text>
            <Text style={styles.compSub}>{completed} of {available} tests</Text>
          </View>
        </View>

        {/* Score trend */}
        {perTest.length > 0 && (
          <View style={{ marginTop: 36 }}>
            <Text style={styles.sectionLabel}>SCORE TREND</Text>
            <Text style={styles.sectionCap}>Each point is one test, in the order taken.</Text>
            <TrendChart tests={perTest} />
            <TrendLabels tests={perTest} />
          </View>
        )}

        {/* Tests this month */}
        {perTest.length > 0 && (
          <View style={{ marginTop: 36 }}>
            <Text style={styles.sectionLabel}>TESTS THIS MONTH</Text>
            {perTest.map(({ test, result }, i) => (
              <View
                key={i}
                style={[styles.trow, i === 0 ? styles.trowFirst : {}]}
              >
                <Text style={styles.tname}>{test.title}</Text>
                <Text style={styles.tsub}>{test.subject}</Text>
                <Text style={styles.tscore}>{result.percent}%</Text>
                <Text style={styles.tgrade}>{result.letter}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Teacher note */}
        <View style={{ marginTop: 36 }}>
          <Text style={styles.sectionLabel}>A NOTE FROM THE TEACHER</Text>
          <View style={styles.noteWrap}>
            <View style={styles.noteBar} />
            {teacherNote ? (
              <Text style={styles.noteText}>{teacherNote}</Text>
            ) : (
              <Text style={styles.notePlaceholder}>No note added.</Text>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>HAMZA TEACHES</Text>
          <Text style={styles.footerText}>GENERATED {today}</Text>
        </View>

      </Page>
    </Document>
  );
}
