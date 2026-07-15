"use client";

import { useMemo } from "react";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";

/**
 * Monthly progress report — the layout/aesthetic taken from the provided report
 * design (charcoal surface, gold accents, no green). It is a pure presentation
 * component: every number is computed by the caller (the student /progress page
 * and the admin analytics student view both build these props from the same
 * selectors they already used), so calculations are untouched.
 *
 * Styling is scoped under `.stureport` with its own fixed dark+gold palette, so
 * the report reads identically regardless of the student's chosen app theme —
 * "keep the dark theme" — and never leaks into surrounding surfaces.
 */

export interface ReportTest {
  title: string;
  subject: string;
  percent: number;
  letter: string;
}

export interface StudentReportProps {
  studentName: string;
  cohortName?: string | null;
  /** e.g. "July 2026" or "All time". */
  monthLabel: string;
  grade: string | null;
  averagePct: number | null;
  /** vs last month, in points; null when there is no prior month to compare. */
  deltaPct?: number | null;
  completion: { pct: number; done: number; total: number };
  trend: LinePoint[];
  tests: ReportTest[];
}

/** Subject rollup derived from the test list (name, count, average). */
function subjectsFrom(tests: ReportTest[]): { name: string; tests: number; avg: number }[] {
  const by = new Map<string, number[]>();
  for (const t of tests) {
    if (!by.has(t.subject)) by.set(t.subject, []);
    by.get(t.subject)!.push(t.percent);
  }
  return Array.from(by.entries())
    .map(([name, ps]) => ({
      name,
      tests: ps.length,
      avg: Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 10) / 10,
    }))
    .sort((a, b) => b.avg - a.avg);
}

export function StudentReport({
  studentName,
  cohortName,
  monthLabel,
  grade,
  averagePct,
  deltaPct,
  completion,
  trend,
  tests,
}: StudentReportProps) {
  const subjects = useMemo(() => subjectsFrom(tests), [tests]);

  return (
    <div className="stureport">
      <style>{css}</style>

      <div className="sr-page">
        <div className="sr-meta">
          MONTHLY PROGRESS REPORT <span className="sr-dot">·</span> {monthLabel.toUpperCase()}
        </div>
        <h1 className="sr-name">{studentName}</h1>
        {cohortName && <div className="sr-cohort">{cohortName}</div>}

        {/* Headline stats */}
        <section className="sr-stats">
          <div className="sr-stat">
            <div className="sr-stat-label">GRADE</div>
            <div className="sr-stat-value gold huge">{grade ?? "—"}</div>
          </div>
          <div className="sr-stat">
            <div className="sr-stat-label">AVERAGE</div>
            <div className="sr-stat-value">{averagePct != null ? `${averagePct}%` : "—"}</div>
            <div className="sr-stat-sub">
              {deltaPct != null
                ? `${deltaPct > 0 ? "+" : ""}${deltaPct}% vs last month`
                : "Across all tests"}
            </div>
          </div>
          <div className="sr-stat">
            <div className="sr-stat-label">COMPLETION</div>
            <div className="sr-stat-value">{completion.pct}%</div>
            <div className="sr-stat-sub">
              {completion.done} of {completion.total} tests
            </div>
          </div>
        </section>

        {/* Score trend — reuses the existing LineChart (gold), so the chart and
            its draw-in animation are unchanged. */}
        {trend.length > 0 && (
          <section className="sr-section">
            <div className="sr-section-head">
              <div>
                <div className="sr-section-label">SCORE TREND</div>
                <div className="sr-section-sub">Each point is one test, in order taken.</div>
              </div>
              <div className="sr-legend">
                <span className="sr-legend-dot" /> Test score (%)
              </div>
            </div>
            <LineChart points={trend} />
          </section>
        )}

        {/* Subject breakdown — gold bars */}
        {subjects.length > 0 && (
          <section className="sr-section">
            <div className="sr-section-label">SUBJECT BREAKDOWN</div>
            <div className="sr-rule-thin" />
            <div className="sr-subjects">
              {subjects.map((s) => (
                <div key={s.name} className="sr-subject-row">
                  <div className="sr-s-name">{s.name}</div>
                  <div className="sr-s-bar">
                    <span className="sr-s-bar-fill" style={{ width: `${Math.max(2, Math.min(100, s.avg))}%` }} />
                  </div>
                  <div className="sr-s-meta">
                    <span className="sr-s-avg">{s.avg.toFixed(1)}%</span>
                    <span className="sr-s-count">{s.tests} {s.tests === 1 ? "test" : "tests"}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tests */}
        {tests.length > 0 && (
          <section className="sr-section">
            <div className="sr-section-label">TESTS</div>
            <div className="sr-rule-thin" />
            <ul className="sr-tests">
              {tests.map((t, i) => (
                <li key={`${t.title}-${i}`} className="sr-test-row">
                  <div className="sr-t-index">{String(i + 1).padStart(2, "0")}</div>
                  <div className="sr-t-body">
                    <div className="sr-t-title">{t.title}</div>
                    <div className="sr-t-subject">{t.subject}</div>
                  </div>
                  <div className="sr-t-score">{t.percent}%</div>
                  <div className="sr-t-grade gold">{t.letter}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* Scoped report styles — fixed dark + gold, adapted responsively from the
   provided report design. */
const css = `
.stureport{
  --sr-bg:#1a1f20; --sr-fg:#e9ecef; --sr-muted:#8a949a;
  --sr-gold:#FBC159; --sr-gold-dim:rgba(251,193,89,.22); --sr-gold-soft:rgba(251,193,89,.12);
  --sr-display:var(--font-bricolage),system-ui,sans-serif;
  color:var(--sr-fg);
}
.stureport .sr-page{
  background:var(--sr-bg);border:1px solid var(--sr-gold-dim);border-radius:14px;
  padding:clamp(18px,4vw,34px);
}
.stureport .sr-meta{font-size:10.5px;font-weight:600;letter-spacing:.24em;color:var(--sr-muted);text-transform:uppercase}
.stureport .sr-dot{margin:0 8px;color:var(--sr-gold)}
.stureport .sr-name{font-family:var(--sr-display);font-weight:800;font-size:clamp(34px,8vw,60px);margin:8px 0 6px;letter-spacing:-.03em;line-height:1;color:#f6f7f8;word-break:break-word}
.stureport .sr-cohort{font-size:13px;color:var(--sr-muted);margin-bottom:22px}

.stureport .sr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid var(--sr-gold-dim);border-bottom:1px solid var(--sr-gold-dim);padding:20px 0;margin-bottom:8px}
.stureport .sr-stat{padding:2px 8px 2px 16px;border-left:2px solid var(--sr-gold)}
.stureport .sr-stat-label{font-weight:600;font-size:9px;letter-spacing:.22em;color:var(--sr-gold);margin-bottom:10px}
.stureport .sr-stat-value{font-family:var(--sr-display);font-weight:800;font-size:clamp(26px,6vw,40px);line-height:1;letter-spacing:-.03em;color:#f6f7f8}
.stureport .sr-stat-value.huge{font-size:clamp(38px,9vw,60px)}
.stureport .sr-stat-value.gold{color:var(--sr-gold)}
.stureport .sr-stat-sub{font-size:11px;color:var(--sr-muted);margin-top:9px;letter-spacing:.02em}

.stureport .sr-section{margin-top:26px}
.stureport .sr-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}
.stureport .sr-section-label{font-weight:600;font-size:10px;letter-spacing:.26em;color:var(--sr-gold);margin-bottom:4px}
.stureport .sr-section-sub{font-size:12px;color:var(--sr-muted)}
.stureport .sr-legend{font-size:10.5px;color:var(--sr-muted);letter-spacing:.08em;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.stureport .sr-legend-dot{width:8px;height:8px;border-radius:999px;background:var(--sr-gold);display:inline-block}
.stureport .sr-rule-thin{height:1px;background:var(--sr-gold-dim);margin:6px 0 2px}

.stureport .sr-subjects{display:flex;flex-direction:column}
.stureport .sr-subject-row{display:grid;grid-template-columns:1.3fr 2.4fr 1.2fr;align-items:center;gap:14px;padding:12px 2px;border-bottom:1px solid var(--sr-gold-dim)}
.stureport .sr-s-name{font-family:var(--sr-display);font-weight:600;font-size:13.5px;color:#f6f7f8}
.stureport .sr-s-bar{position:relative;height:6px;background:var(--sr-gold-soft);border-radius:999px;overflow:hidden}
.stureport .sr-s-bar-fill{position:absolute;inset:0 auto 0 0;background:var(--sr-gold);border-radius:999px}
.stureport .sr-s-meta{display:flex;justify-content:flex-end;gap:12px;font-size:12px;color:var(--sr-muted)}
.stureport .sr-s-avg{color:var(--sr-gold);font-weight:600;font-variant-numeric:tabular-nums}

.stureport .sr-tests{list-style:none;margin:0;padding:0}
.stureport .sr-test-row{display:grid;grid-template-columns:32px 1fr auto auto;align-items:center;gap:14px;padding:14px 2px;border-bottom:1px solid var(--sr-gold-dim)}
.stureport .sr-t-index{font-family:var(--sr-display);font-weight:600;font-size:12px;color:var(--sr-gold);letter-spacing:.1em}
.stureport .sr-t-title{font-family:var(--sr-display);font-weight:600;font-size:15px;letter-spacing:-.01em;color:#f6f7f8}
.stureport .sr-t-subject{font-size:12px;color:var(--sr-muted);margin-top:2px}
.stureport .sr-t-score{font-weight:600;font-size:15px;color:var(--sr-fg);text-align:right;font-variant-numeric:tabular-nums}
.stureport .sr-t-grade{font-family:var(--sr-display);font-weight:800;font-size:20px;text-align:right;letter-spacing:-.02em;min-width:34px}
.stureport .sr-t-grade.gold{color:var(--sr-gold)}

@media (max-width:520px){
  .stureport .sr-stats{grid-template-columns:1fr;gap:0}
  .stureport .sr-stat{padding:12px 8px 12px 16px;border-bottom:1px solid var(--sr-gold-dim)}
  .stureport .sr-stat:last-child{border-bottom:0}
  .stureport .sr-subject-row{grid-template-columns:1fr auto;gap:6px 12px}
  .stureport .sr-subject-row .sr-s-bar{grid-column:1 / -1;order:3}
}
`;
