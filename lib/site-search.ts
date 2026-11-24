/**
 * One small list of everything a visitor can search for besides the papers
 * themselves (those have their own list, /past-papers/search.json): articles,
 * topic question pages, most repeated topics, grade thresholds, syllabus
 * checklists and tools. Server only; built once at deploy by /search.json.
 */
import { allArticles } from "@/lib/blog";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { SYLLABI } from "@/lib/syllabus";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { hasTopical, topicalFor } from "@/lib/topical";

export type SiteKind = "Article" | "Questions by topic" | "Most repeated topics" | "Grade thresholds" | "Syllabus" | "Tool";

export interface SiteRow {
  /** URL */
  u: string;
  /** Title shown */
  t: string;
  /** Small line under the title */
  s: string;
  k: SiteKind;
  /** Lower-case words to match. */
  w: string;
}

const TOOLS: Array<{ u: string; t: string; s: string; w: string }> = [
  { u: "/tools/grade-predictor", t: "Grade predictor", s: "Your marks as a Cambridge grade", w: "grade predictor marks boundaries calculator" },
  { u: "/tools/formula-sheet", t: "Formula sheets", s: "Every formula for your syllabus, free to print", w: "formula sheet formulas ratios list print 0452 7707 0455 2281 0264 7081 9706 9708 9609" },
  { u: "/tools/economics-diagrams", t: "Economics diagrams", s: "Every diagram to draw for 0455, 2281 and AS and A Level 9708", w: "economics diagrams diagram ppc demand supply elasticity maximum minimum price tax subsidy wage costs ad as aggregate buffer stock consumer producer surplus externalities monopoly monopsony perfect competition kinked phillips laffer lorenz kuznets j curve indifference 0455 2281 9708 draw" },
  { u: "/tools/ratio-calculator", t: "Ratio calculator", s: "Every IGCSE and O Level accounting ratio", w: "ratio calculator accounting ratios formula 0452 7707 current ratio margin" },
  { u: "/tools/depreciation-calculator", t: "Depreciation calculator", s: "Straight line and reducing balance", w: "depreciation calculator straight line reducing balance" },
  { u: "/tools/break-even-calculator", t: "Break even calculator", s: "Break even output and margin of safety", w: "break even breakeven calculator contribution margin of safety business" },
  { u: "/tools/investment-appraisal-calculator", t: "Investment appraisal calculator", s: "Payback, ARR and NPV", w: "investment appraisal payback arr npv calculator 9609" },
  { u: "/tools/elasticity-calculator", t: "Elasticity calculator", s: "PED, YED and XED", w: "elasticity calculator ped yed xed price income cross economics" },
  { u: "/tools/past-paper-mcq", t: "Past paper MCQ checker", s: "Mark your multiple choice answers", w: "mcq multiple choice checker answers paper 1 marking" },
  { u: "/tools/exam-countdown", t: "Exam countdown", s: "Days to your paper", w: "exam countdown days timetable date" },
  { u: "/tools/revision-planner", t: "Revision planner", s: "A weekly plan up to your exam", w: "revision planner plan timetable study schedule" },
];

const levelWords = (level: string) => (level === "AS and A Level" ? "a level as level alevel a2" : level === "O Level" ? "o level olevel" : "igcse");

export async function siteRows(): Promise<SiteRow[]> {
  const rows: SiteRow[] = [];
  for (const a of await allArticles()) {
    rows.push({ u: `/blog/${a.slug}`, t: a.title, s: `${a.subject}, ${a.code}`, k: "Article", w: `${a.title} ${a.code} ${a.subject} ${a.level} ${a.slug.replace(/-/g, " ")}`.toLowerCase() });
  }
  for (const s of PAST_PAPER_SYLLABI) {
    if (!hasTopical(s.code)) continue;
    const base = `${s.name} ${s.code} ${s.subject} ${levelWords(s.level)}`.toLowerCase();
    rows.push({ u: `/past-papers/${s.slug}/most-repeated-topics`, t: `${s.short}: most repeated topics`, s: "Counted from every past paper", k: "Most repeated topics", w: `${base} most repeated topics common chapters important` });
    for (const e of topicalFor(s.code)) {
      if (!e.questions.length) continue;
      rows.push({
        u: `/past-papers/${s.slug}/topics/${e.slug}`,
        t: e.sub.name,
        s: `${e.questions.length} past paper questions, ${s.short}`,
        k: "Questions by topic",
        w: `${e.sub.name} ${e.topic.name} ${e.sub.num} ${base} questions topical`.toLowerCase(),
      });
    }
  }
  for (const t of THRESHOLD_PAGES) {
    rows.push({ u: `/grade-thresholds/${t.slug}`, t: `${t.name} grade thresholds`, s: "Marks needed for each grade", k: "Grade thresholds", w: `${t.name} ${t.code} ${t.subject} ${levelWords(t.level)} grade thresholds boundaries threshold marks a*`.toLowerCase() });
  }
  for (const s of SYLLABI) {
    rows.push({ u: `/syllabus/${s.slug}`, t: `${s.name} syllabus`, s: `Topic list and official PDF, ${s.exams}`, k: "Syllabus", w: `${s.name} ${s.code} ${s.subject} syllabus topics checklist ${s.exams}`.toLowerCase() });
  }
  for (const t of TOOLS) rows.push({ u: t.u, t: t.t, s: t.s, k: "Tool", w: `${t.t} ${t.w}`.toLowerCase() });
  return rows;
}
