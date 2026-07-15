"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  Line,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "@react-pdf/renderer";
import type { GradeLetter, GradeResult } from "@/lib/grading";
import type { Test } from "@/types";

// ============================================================================
// Monthly report PDF — presentation only. The design is a faithful react-pdf
// translation of the provided ReportPage.tsx (black + gold, no green). Every
// value comes from the props the roster page already computes; nothing here
// fetches, calculates, or recalculates. @react-pdf has no HTML/CSS, so the CSS
// is reproduced as StyleSheet + Svg primitives.
// ============================================================================

// A4 in points: 595.28 × 841.89. Side padding 45 ≈ 16mm → content width 505.
const CONTENT_W = 505;

// Palette — from the ReportPage spec. Only dark / gold / white / gray. No green.
const BG        = "#1a1f20";
const FG        = "#e9ecef";
const HEAD      = "#f6f7f8";
const MUT       = "#8a949a";
const GOLD      = "#FBC159";
const GOLD_DIM  = "rgba(251,193,89,0.22)";
const GOLD_SOFT = "rgba(251,193,89,0.12)";
const DIVIDER   = "rgba(251,193,89,0.35)";

const styles = StyleSheet.create({
  page: {
    backgroundColor: BG,
    paddingHorizontal: 45,
    paddingTop: 44,
    paddingBottom: 34,
    fontFamily: "Helvetica",
    color: FG,
    fontSize: 11,
    flexDirection: "column",
  },

  // ── Masthead ─────────────────────────────────────────────
  hdr: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandBlock: { flexDirection: "row", alignItems: "center" },
  brandMark: {
    width: 30,
    height: 30,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  brandMarkText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 0.5 },
  brandName: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: FG },
  brandSub: { fontSize: 7, letterSpacing: 1, color: MUT, marginTop: 2 },
  confidential: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: GOLD,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 2,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  rule: { height: 1, backgroundColor: DIVIDER, marginTop: 12, marginBottom: 18 },
  ruleThin: { height: 1, backgroundColor: GOLD_DIM, marginTop: 6, marginBottom: 2 },

  // ── Report label + name ──────────────────────────────────
  meta: { fontSize: 8, letterSpacing: 2.4, color: MUT },
  metaDot: { color: GOLD },
  name: {
    fontSize: 44,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
    color: HEAD,
    lineHeight: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  cohort: { fontSize: 10, color: MUT, marginBottom: 20 },

  // ── Stats ────────────────────────────────────────────────
  stats: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: GOLD_DIM,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_DIM,
    paddingVertical: 16,
    marginBottom: 8,
  },
  stat: { flex: 1, paddingLeft: 14, paddingRight: 12, borderLeftWidth: 1.5, borderLeftColor: GOLD },
  statFirst: { paddingLeft: 11 },
  statLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: GOLD, marginBottom: 10 },
  statValue: { fontSize: 32, fontFamily: "Helvetica-Bold", color: HEAD, lineHeight: 1 },
  statValueHuge: { fontSize: 50, fontFamily: "Helvetica-Bold", color: GOLD, lineHeight: 1 },
  statSub: { fontSize: 8, color: MUT, marginTop: 8 },

  // ── Sections ─────────────────────────────────────────────
  section: { marginTop: 20 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 },
  sectionLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 2.4, color: GOLD, marginBottom: 4 },
  sectionSub: { fontSize: 9, color: MUT },
  legend: { flexDirection: "row", alignItems: "center", fontSize: 8, color: MUT },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginRight: 5 },

  // ── Subject breakdown ────────────────────────────────────
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_DIM,
  },
  sName: { width: 130, fontSize: 10, fontFamily: "Helvetica-Bold", color: HEAD },
  sBar: { flex: 1, height: 5, backgroundColor: GOLD_SOFT, borderRadius: 3, marginHorizontal: 12 },
  sBarFill: { height: 5, backgroundColor: GOLD, borderRadius: 3 },
  sMeta: { width: 96, flexDirection: "row", justifyContent: "flex-end" },
  sAvg: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GOLD, marginRight: 10 },
  sCount: { fontSize: 9, color: MUT },

  // ── Tests ────────────────────────────────────────────────
  testRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_DIM,
  },
  tIndex: { width: 28, fontSize: 9, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 1 },
  tBody: { flex: 1 },
  tTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: HEAD },
  tSubject: { fontSize: 9, color: MUT, marginTop: 2 },
  tScore: { width: 60, textAlign: "right", fontSize: 11, fontFamily: "Helvetica-Bold", color: FG },
  tGrade: { width: 40, textAlign: "right", fontSize: 15, fontFamily: "Helvetica-Bold", color: GOLD },

  // ── Teacher note ─────────────────────────────────────────
  note: {
    flexDirection: "row",
    backgroundColor: GOLD_SOFT,
    borderRadius: 3,
    padding: 10,
    marginTop: 10,
    minHeight: 42,
  },
  noteBar: { width: 2, backgroundColor: GOLD, borderRadius: 1, marginRight: 12 },
  noteText: { flex: 1, fontSize: 9.5, color: FG, lineHeight: 1.5 },
  notePlaceholder: { flex: 1, fontSize: 9.5, color: MUT, fontFamily: "Helvetica-Oblique" },

  // ── Footer ───────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GOLD_DIM,
  },
  footerText: { fontSize: 7, color: MUT, letterSpacing: 1.5 },
  footerCenter: { fontSize: 7, color: GOLD, letterSpacing: 1.5 },
});

function formatMonthFull(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

// ── Score-trend chart ───────────────────────────────────────
// Plots the SAME values the report already used (one point per test). Only the
// appearance changes: gold area gradient + gold line + gold dots, gray/gold
// dashed grid — no green. Axis and point labels overlay the SVG as text (SVG
// text is unreliable in react-pdf), positioned from the same geometry.
function Chart({ tests }: { tests: Array<{ result: { percent: number } }> }) {
  if (!tests.length) return null;

  const CW = CONTENT_W;
  const CH = 150;
  const padL = 34;
  const padR = 14;
  const padT = 20;
  const padB = 26;
  const innerW = CW - padL - padR;
  const innerH = CH - padT - padB;

  const vals = tests.map((t) => t.result.percent);
  const single = vals.length === 1;
  const yMin = Math.max(0, Math.floor((Math.min(...vals) - 15) / 10) * 10);
  const yMax = 100;
  const range = yMax - yMin || 20;

  const cx = (i: number) => padL + (single ? innerW / 2 : (i / (vals.length - 1)) * innerW);
  const cy = (v: number) => padT + innerH - ((v - yMin) / range) * innerH;

  const pts = vals.map((v, i) => ({ x: cx(i), y: cy(v), v }));
  const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD =
    `M${pts[0].x},${padT + innerH} ` +
    pts.map((p) => `L${p.x},${p.y}`).join(" ") +
    ` L${pts[pts.length - 1].x},${padT + innerH} Z`;

  const yTicks = 4;
  const yValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round(yMin + (range * i) / yTicks));

  return (
    <View style={{ position: "relative", width: CW, height: CH }}>
      <Svg width={CW} height={CH}>
        <Defs>
          <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GOLD} stopOpacity={0.32} />
            <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Grid — gray/gold dashed, never green */}
        {yValues.map((v, i) => (
          <Line
            key={i}
            x1={padL}
            y1={cy(v)}
            x2={CW - padR}
            y2={cy(v)}
            stroke={GOLD_SOFT}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}

        {!single && <Path d={areaD} fill="url(#areaFill)" />}
        {!single && (
          <Path d={lineD} fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill={GOLD} stroke={BG} strokeWidth={2} />
        ))}
      </Svg>

      {/* Y-axis labels */}
      {yValues.map((v, i) => (
        <Text
          key={`y-${i}`}
          style={{ position: "absolute", left: 0, top: cy(v) - 4, width: padL - 8, textAlign: "right", fontSize: 7, color: MUT }}
        >
          {v}
        </Text>
      ))}

      {/* Score label above each dot */}
      {pts.map((p, i) => (
        <Text
          key={`s-${i}`}
          style={{ position: "absolute", left: p.x - 18, top: p.y - 18, width: 36, textAlign: "center", fontSize: 8, fontFamily: "Helvetica-Bold", color: GOLD }}
        >
          {p.v}%
        </Text>
      ))}

      {/* X-axis: Test N */}
      {pts.map((p, i) => (
        <Text
          key={`x-${i}`}
          style={{ position: "absolute", left: p.x - 22, top: CH - 12, width: 44, textAlign: "center", fontSize: 7, color: MUT }}
        >
          Test {i + 1}
        </Text>
      ))}
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
  const today = new Date()
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();

  // Subject breakdown is a display grouping of the SAME per-test results the
  // report already shows — no new data, no analytics change.
  const subjBy = new Map<string, number[]>();
  for (const { test, result } of perTest) {
    if (!subjBy.has(test.subject)) subjBy.set(test.subject, []);
    subjBy.get(test.subject)!.push(result.percent);
  }
  const subjects = Array.from(subjBy.entries())
    .map(([name, ps]) => ({ name, tests: ps.length, avg: Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Masthead */}
        <View style={styles.hdr}>
          <View style={styles.brandBlock}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>HT</Text>
            </View>
            <View>
              <Text style={styles.brandName}>HAMZA TEACHES</Text>
              <Text style={styles.brandSub}>BUSINESS &amp; ECONOMICS TUITION</Text>
            </View>
          </View>
          <Text style={styles.confidential}>CONFIDENTIAL</Text>
        </View>

        <View style={styles.rule} />

        {/* Report label + name */}
        <Text style={styles.meta}>
          MONTHLY PROGRESS REPORT <Text style={styles.metaDot}>·</Text> {formatMonthFull(month).toUpperCase()}
        </Text>
        <Text style={styles.name}>{studentName}</Text>
        {cohortName && <Text style={styles.cohort}>Cohort {cohortName}</Text>}

        {/* Stats */}
        <View style={styles.stats}>
          <View style={[styles.stat, styles.statFirst]}>
            <Text style={styles.statLabel}>GRADE</Text>
            <Text style={styles.statValueHuge}>{grade ?? "—"}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>AVERAGE</Text>
            <Text style={styles.statValue}>{monthAvg != null ? `${monthAvg}%` : "—"}</Text>
            <Text style={styles.statSub}>Across all tests</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>COMPLETION</Text>
            <Text style={styles.statValue}>{completionPct}%</Text>
            <Text style={styles.statSub}>{completed} of {available} tests</Text>
          </View>
        </View>

        {/* Score trend */}
        {perTest.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionLabel}>SCORE TREND</Text>
                <Text style={styles.sectionSub}>Each point is one test, in the order taken.</Text>
              </View>
              <View style={styles.legend}>
                <View style={styles.legendDot} />
                <Text>Test score (%)</Text>
              </View>
            </View>
            <Chart tests={perTest} />
          </View>
        )}

        {/* Subject breakdown */}
        {subjects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SUBJECT BREAKDOWN</Text>
            <View style={styles.ruleThin} />
            {subjects.map((s, i) => (
              <View key={i} style={styles.subjectRow}>
                <Text style={styles.sName}>{s.name}</Text>
                <View style={styles.sBar}>
                  <View style={[styles.sBarFill, { width: `${Math.max(2, Math.min(100, s.avg))}%` }]} />
                </View>
                <View style={styles.sMeta}>
                  <Text style={styles.sAvg}>{s.avg.toFixed(1)}%</Text>
                  <Text style={styles.sCount}>{s.tests} {s.tests === 1 ? "test" : "tests"}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Tests this month */}
        {perTest.length > 0 && (
          <View style={[styles.section, { flexGrow: 1 }]}>
            <Text style={styles.sectionLabel}>TESTS THIS MONTH</Text>
            <View style={styles.ruleThin} />
            {perTest.map(({ test, result }, i) => (
              <View key={i} style={styles.testRow}>
                <Text style={styles.tIndex}>{String(i + 1).padStart(2, "0")}</Text>
                <View style={styles.tBody}>
                  <Text style={styles.tTitle}>{test.title}</Text>
                  <Text style={styles.tSubject}>{test.subject}</Text>
                </View>
                <Text style={styles.tScore}>{result.percent}%</Text>
                <Text style={styles.tGrade}>{result.letter}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Teacher note */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>A NOTE FROM THE TEACHER</Text>
          <View style={styles.note}>
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
          <Text style={styles.footerCenter}>MONTHLY PROGRESS REPORT</Text>
          <Text style={styles.footerText}>GENERATED {today}</Text>
        </View>
      </Page>
    </Document>
  );
}
