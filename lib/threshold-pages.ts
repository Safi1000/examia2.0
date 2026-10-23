/**
 * The grade threshold pages (/grade-thresholds and one page per syllabus),
 * built only from Cambridge's official tables in lib/grade-thresholds.ts.
 * AS and A Level share a syllabus code, so they share one page.
 */
import { SESSIONS, THRESHOLDS, type Qualification, type SyllabusThresholds, type ThresholdSet } from "@/lib/grade-thresholds";
import { marksNeeded, targetGrades } from "@/lib/grade-predictor";

export type Session = (typeof SESSIONS)[number];

export interface ThresholdPage {
  slug: string;
  code: string;
  subject: SyllabusThresholds["subject"];
  /** "O Level", "IGCSE" or "AS and A Level". */
  level: string;
  /** "O Level Accounting 7707". */
  name: string;
  syllabuses: SyllabusThresholds[];
}

const levelName = (q: Qualification[]) => (q.includes("AS Level") ? "AS and A Level" : q[0]);
const subjectWord = (s: string) => (s === "Business" ? "Business" : s);

export const THRESHOLD_PAGES: ThresholdPage[] = (() => {
  const byCode = new Map<string, SyllabusThresholds[]>();
  for (const t of THRESHOLDS) byCode.set(t.code, [...(byCode.get(t.code) ?? []), t]);
  // O Level first (the biggest group in Pakistan), then IGCSE, then AS and A Level.
  const order = ["7707", "2281", "7115", "0452", "0455", "0450", "9706", "9708", "9609"];
  return [...byCode.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([code, list]) => {
      const level = levelName(list.map((l) => l.qualification));
      const subject = list[0].subject;
      const slugLevel = level === "AS and A Level" ? "a-level" : level === "O Level" ? "o-level" : "igcse";
      return {
        slug: `${slugLevel}-${subject.toLowerCase()}-${code}`,
        code,
        subject,
        level,
        name: `${level} ${subjectWord(subject)} ${code}`,
        syllabuses: list,
      };
    });
})();

export const thresholdPage = (slug: string) => THRESHOLD_PAGES.find((p) => p.slug === slug) ?? null;

export const pct = (n: number, max: number) => Math.round((n / max) * 100);

/** Sessions this syllabus has data for, newest first. */
export const sessionsOf = (s: SyllabusThresholds) => SESSIONS.filter((x) => s.sessions[x]);

/** The variant with the lowest and highest minimum for a grade in one session. */
export function spread(s: SyllabusThresholds, session: Session, grade: string) {
  const sets = Object.entries(s.sessions[session]?.variants ?? {}).filter(([, v]) => typeof v.thresholds[grade] === "number");
  if (!sets.length) return null;
  const vals = sets.map(([variant, v]) => ({ variant, min: v.thresholds[grade], max: v.max }));
  vals.sort((a, b) => a.min - b.min);
  return { low: vals[0], high: vals[vals.length - 1] };
}

/** Grades in the order Cambridge lists them for this syllabus. */
export function gradesOf(s: SyllabusThresholds): string[] {
  const first: ThresholdSet | undefined = Object.values(s.sessions[sessionsOf(s)[0]]?.variants ?? {})[0];
  return Object.keys(first?.thresholds ?? {});
}

/** "Safe" targets: the highest recent minimum for each top grade. */
export function safeTargets(s: SyllabusThresholds) {
  return targetGrades(s)
    .map((g) => marksNeeded(s, g))
    .filter((n): n is NonNullable<typeof n> => !!n);
}

/** Average minimum for a grade in a session, as a percentage of the total. */
export function averagePct(s: SyllabusThresholds, session: Session, grade: string): number | null {
  const v = Object.values(s.sessions[session]?.variants ?? {}).filter((x) => typeof x.thresholds[grade] === "number");
  if (!v.length) return null;
  return Math.round(v.reduce((sum, x) => sum + (x.thresholds[grade] / x.max) * 100, 0) / v.length);
}

export const gradeShown = (q: Qualification, g: string) => (q === "AS Level" && g !== "U" ? g.toLowerCase() : g);
