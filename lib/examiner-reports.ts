/**
 * Examiner report pages: what Cambridge's examiners said about each paper in a
 * series, retold in Hamza's own words (lib/examiner-reports.json, written from
 * the reports in past-papers/). One page per syllabus per series, under
 * /past-papers/<syllabus>/examiner-report/<series>, plus a hub at
 * /past-papers/examiner-reports.
 */
import data from "@/lib/examiner-reports.json";
import {
  PAST_PAPER_SYLLABI,
  SERIES_NAME,
  fileName,
  paperHref,
  papersFor,
  pdfUrl,
  sessionsFor,
  type Paper,
  type PastPaperSyllabus,
} from "@/lib/past-papers";

export interface ReportQuestion {
  q: string;
  topic: string;
  issue: string;
  fix: string;
}
export interface ReportPaper {
  num: string;
  title: string;
  variants: string[];
  well: string[];
  mistakes: string[];
  fix: string[];
  questions: ReportQuestion[];
}
export interface ExaminerReport {
  code: string;
  /** "m26": m = Feb/March, s = May/June, w = Oct/Nov. */
  series: string;
  /** The one short phrase quoted from the report, word for word. */
  quote: { text: string; paper: string } | null;
  takeaways: string[];
  papers: ReportPaper[];
}

type S = "m" | "s" | "w";
const ORDER: Record<S, number> = { m: 0, s: 1, w: 2 };
const SLUG: Record<S, string> = { m: "feb-march", s: "may-june", w: "oct-nov" };
/** The month students type when they search: "9706 examiner report June 2025". */
const MONTH: Record<S, string> = { m: "March", s: "June", w: "November" };

const year = (series: string) => 2000 + Number(series.slice(1));
const letter = (series: string) => series[0] as S;

/** Newest series first, then in syllabus order. */
export const EXAMINER_REPORTS: ExaminerReport[] = (data as ExaminerReport[])
  .filter((r) => PAST_PAPER_SYLLABI.some((s) => s.code === r.code))
  .sort(
    (a, b) =>
      year(b.series) - year(a.series) ||
      ORDER[letter(b.series)] - ORDER[letter(a.series)] ||
      PAST_PAPER_SYLLABI.findIndex((s) => s.code === a.code) - PAST_PAPER_SYLLABI.findIndex((s) => s.code === b.code),
  );

export const EXAMINER_REPORTS_HUB = "/past-papers/examiner-reports";

/** "may-june-2025" */
export const reportSlug = (series: string) => `${SLUG[letter(series)]}-${year(series)}`;
/** "May/June 2025" */
export const reportSeriesLabel = (series: string) => `${SERIES_NAME[letter(series)]} ${year(series)}`;
/** "June 2025" */
export const reportMonthLabel = (series: string) => `${MONTH[letter(series)]} ${year(series)}`;

export const reportSyllabus = (r: ExaminerReport) => PAST_PAPER_SYLLABI.find((s) => s.code === r.code)!;
export const reportHref = (r: ExaminerReport) => `/past-papers/${reportSyllabus(r).slug}/examiner-report/${reportSlug(r.series)}`;
export const reportsFor = (code: string) => EXAMINER_REPORTS.filter((r) => r.code === code);
export const reportBySlug = (s: PastPaperSyllabus, slug: string) => reportsFor(s.code).find((r) => reportSlug(r.series) === slug) ?? null;

/** The paper pages on this site for the variants a report section covers (skips any held back). */
export function reportPapers(r: ExaminerReport, p: ReportPaper): Paper[] {
  const all = papersFor(r.code).filter((x) => `${x.session.s}${String(x.session.y).slice(2)}` === r.series);
  return p.variants.map((v) => all.find((x) => x.pv === v)).filter((x): x is Paper => !!x);
}
export const reportPaperHref = (r: ExaminerReport, paper: Paper) => paperHref(reportSyllabus(r).slug, paper);

/** The original Cambridge report PDF, when the library holds it. */
export function reportPdf(r: ExaminerReport): string | null {
  const session = sessionsFor(r.code).find((x) => `${x.s}${String(x.y).slice(2)}` === r.series);
  return session?.er ? pdfUrl(fileName(r.code, session, "er")) : null;
}

/** "9706 Examiner Report June 2025: Common Mistakes by Paper", within 60 characters. */
export function reportTitle(r: ExaminerReport) {
  const base = `${r.code} Examiner Report ${reportMonthLabel(r.series)}`;
  for (const tail of [": Common Mistakes by Paper", ": Common Mistakes", ""]) if ((base + tail).length <= 60) return base + tail;
  return base;
}

/** About 155 characters, opening with the search words. */
export function reportDescription(r: ExaminerReport) {
  const s = reportSyllabus(r);
  const n = r.papers.length;
  const options = [
    `${s.name} examiner report, ${reportSeriesLabel(r.series)}: what candidates did well, the most common mistakes and what to do instead, paper by paper.`,
    `${s.name} examiner report, ${reportSeriesLabel(r.series)}: the most common mistakes and what to do instead, across ${n} paper${n > 1 ? "s" : ""}.`,
    `${r.code} examiner report, ${reportSeriesLabel(r.series)}: the most common mistakes and what to do instead, paper by paper.`,
  ];
  return options.find((o) => o.length <= 160) ?? options[options.length - 1];
}

/** "Paper 22: Structured questions", or "Papers 21 and 23: ..." when the report covers variants together. */
export function paperHeading(p: ReportPaper) {
  const v = p.variants;
  const nums = v.length === 1 ? `Paper ${v[0]}` : `Papers ${v.slice(0, -1).join(", ")} and ${v[v.length - 1]}`;
  return `${nums}: ${p.title}`;
}
