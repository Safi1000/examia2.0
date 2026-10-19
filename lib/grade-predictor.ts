/**
 * Pure logic for the free grade predictor (/tools/grade-predictor), built on
 * Cambridge's official grade thresholds in lib/grade-thresholds.ts.
 *
 * - Marks from a June 2026 or June 2025 paper with a known variant are graded
 *   against that exact paper's published thresholds.
 * - Any other paper (a school mock, an older past paper) is graded against
 *   every June 2026 and June 2025 variant, and the result says the most common
 *   grade and the range.
 */
import {
  SESSIONS,
  THRESHOLDS,
  type Qualification,
  type SyllabusThresholds,
  type ThresholdSet,
} from "@/lib/grade-thresholds";

export type Subject = SyllabusThresholds["subject"];
export const SUBJECTS: Subject[] = ["Accounting", "Business", "Economics"];
export const QUALIFICATIONS: Qualification[] = ["O Level", "IGCSE", "AS Level", "A Level"];
export type PaperSource = (typeof SESSIONS)[number] | "Other";

export function syllabusFor(subject: Subject, q: Qualification): SyllabusThresholds | undefined {
  return THRESHOLDS.find((t) => t.subject === subject && t.qualification === q);
}

/** AS grades are written in lower case by Cambridge (a to e). */
export function gradeLabel(q: Qualification, grade: string): string {
  return q === "AS Level" && grade !== "U" ? grade.toLowerCase() : grade;
}

/** Variants published for a session, e.g. ["1", "2", "3"]. */
export function variantsFor(s: SyllabusThresholds, session: (typeof SESSIONS)[number]): string[] {
  return Object.keys(s.sessions[session]?.variants ?? {}).sort();
}

/** Cambridge's weighted total, rounded to a whole mark. */
export function weightedTotal(s: SyllabusThresholds, marks: number[]): number {
  return Math.round(marks.reduce((sum, m, i) => sum + m * s.factors[i], 0));
}

/** Highest grade whose minimum the total reaches, or "U". */
export function gradeIn(set: ThresholdSet, total: number): string {
  for (const [g, min] of Object.entries(set.thresholds)) if (total >= min) return g;
  return "U";
}

export interface NextGrade {
  grade: string;
  /** Weighted marks still needed. */
  weighted: number;
  /** The same gap in raw marks on the longest paper. */
  raw: number;
  paper: number;
}

function nextGrade(s: SyllabusThresholds, set: ThresholdSet, total: number): NextGrade | null {
  const entries = Object.entries(set.thresholds);
  const idx = entries.findIndex(([, min]) => total >= min);
  const target = idx === -1 ? entries[entries.length - 1] : idx > 0 ? entries[idx - 1] : null;
  if (!target) return null;
  const weighted = target[1] - total;
  // Express the gap on the paper worth the most marks, which is where most students gain.
  const paper = s.papers.indexOf(Math.max(...s.papers));
  return { grade: target[0], weighted, raw: Math.max(1, Math.ceil(weighted / s.factors[paper])), paper: paper + 1 };
}

export interface Prediction {
  exact: boolean;
  grade: string;
  total: number;
  max: number;
  /** The threshold set shown on the scale (the exact one, or June 2026 variant 1). */
  set: ThresholdSet;
  next: NextGrade | null;
  /** For "Other" papers: lowest and highest grade across all recent papers. */
  range?: { low: string; high: string };
  source: string;
  label: string;
}

/**
 * `marks` must hold a number for every paper. Returns null if any is missing
 * or out of range.
 */
export function predict(
  s: SyllabusThresholds,
  marks: number[],
  source: PaperSource,
  variant: string | null,
): Prediction | null {
  if (marks.length !== s.papers.length) return null;
  if (marks.some((m, i) => !Number.isFinite(m) || m < 0 || m > s.papers[i])) return null;
  const total = weightedTotal(s, marks);

  if (source !== "Other" && variant) {
    const sess = s.sessions[source];
    const set = sess?.variants[variant];
    if (set) {
      return {
        exact: true,
        grade: gradeIn(set, total),
        total,
        max: set.max,
        set,
        next: nextGrade(s, set, total),
        source: sess.source,
        label: `${source} paper, variant ${variant}`,
      };
    }
  }

  // Any other paper: grade against every recent June paper.
  const sets: ThresholdSet[] = [];
  for (const sess of SESSIONS) for (const v of Object.values(s.sessions[sess]?.variants ?? {})) sets.push(v);
  if (!sets.length) return null;
  const order = [...Object.keys(sets[0].thresholds), "U"];
  const grades = sets.map((set) => gradeIn(set, total));
  const counts = new Map<string, number>();
  for (const g of grades) counts.set(g, (counts.get(g) ?? 0) + 1);
  // Most common grade; on a tie, the lower one (never flatter the student).
  const grade = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(b[0]) - order.indexOf(a[0]))[0][0];
  const sorted = [...new Set(grades)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const ref = sets.find((set) => gradeIn(set, total) === grade) ?? sets[0];
  return {
    exact: false,
    grade,
    total,
    max: ref.max,
    set: ref,
    next: nextGrade(s, ref, total),
    range: { high: sorted[0], low: sorted[sorted.length - 1] },
    source: s.sessions["June 2026"].source,
    label: "June 2026 and June 2025 papers",
  };
}

/** Problem with one paper's mark, or null. */
export function markError(value: string, max: number): string | null {
  if (value === "") return null;
  const m = Number(value);
  if (!Number.isFinite(m) || m < 0) return "Enter a mark of 0 or more.";
  if (!Number.isInteger(m)) return "Use whole marks.";
  if (m > max) return `This paper is out of ${max}.`;
  return null;
}

export interface BoundaryOutlook {
  grade: string;
  /** Lowest and highest minimum for this grade across all recent June papers. */
  low: number;
  high: number;
  /** Average minimum, June 2026 minus June 2025 (positive = got harder). */
  trend: number;
  /** Safe target for the coming session: the highest recent minimum. */
  safe: number;
  /** Raw marks still needed on the longest paper to reach `safe` (0 if there). */
  rawToSafe: number;
  paper: number;
}

/**
 * What it takes to be safe for `grade` next session, from how the last two
 * June sessions set it. Cambridge has not published May/June 2027 boundaries,
 * so this is guidance from the trend, not a forecast of exact numbers.
 */
export function outlook(s: SyllabusThresholds, grade: string, total: number): BoundaryOutlook | null {
  const bySession = SESSIONS.map((sess) =>
    Object.values(s.sessions[sess]?.variants ?? {})
      .map((v) => v.thresholds[grade])
      .filter((n): n is number => typeof n === "number"),
  );
  const all = bySession.flat();
  if (!all.length) return null;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const trend = Math.round(avg(bySession[0]) - avg(bySession[1]));
  const safe = Math.max(...all);
  const paper = s.papers.indexOf(Math.max(...s.papers));
  const gap = Math.max(0, safe - total);
  return {
    grade,
    low: Math.min(...all),
    high: safe,
    trend: Number.isFinite(trend) ? trend : 0,
    safe,
    rawToSafe: gap === 0 ? 0 : Math.ceil(gap / s.factors[paper]),
    paper: paper + 1,
  };
}

/** A short, slightly cheeky line for each grade. Never mean, always fixable. */
export function roast(grade: string): string {
  switch (grade.toUpperCase()) {
    case "A*":
      return "Okay, show-off. Now don't get comfortable.";
    case "A":
      return "So close to the A* it's annoying. Annoying for you, I mean.";
    case "B":
      return "Solid. But 'solid' isn't what you told your parents you'd get.";
    case "C":
      return "You passed. Your future self is asking if that's the plan.";
    case "D":
      return "This is a 'we need to talk' grade. Not panicking. Yet.";
    case "E":
      return "Technically a grade. Emotionally, a cry for help.";
    case "F":
    case "G":
      return "Your mock is sending an SOS. Good news: there's still time.";
    default:
      return "Bold strategy. Let's not take it into the real exam.";
  }
}
