/**
 * Cambridge syllabus content for the syllabuses Hamza teaches, taken from
 * Cambridge International's own syllabus documents (lib/syllabus-data/*.json,
 * extracted from the PDFs linked in `source`). Used by the syllabus
 * checklists (/syllabus) and the revision planner.
 */
import d0264 from "@/lib/syllabus-data/0264.json";
import d0452 from "@/lib/syllabus-data/0452.json";
import d0455 from "@/lib/syllabus-data/0455.json";
import d2281 from "@/lib/syllabus-data/2281.json";
import d7081 from "@/lib/syllabus-data/7081.json";
import d7707 from "@/lib/syllabus-data/7707.json";
import d9609 from "@/lib/syllabus-data/9609.json";
import d9706 from "@/lib/syllabus-data/9706.json";
import d9708 from "@/lib/syllabus-data/9708.json";
import type { LevelName, SubjectName } from "@/lib/landing";

export interface Part {
  num: string;
  name: string;
  points: string[];
}
export interface Subtopic {
  num: string;
  name: string;
  parts: Part[];
}
export interface Topic {
  num: string;
  name: string;
  subs: Subtopic[];
}

export interface SyllabusInfo {
  code: string;
  slug: string;
  subject: SubjectName;
  level: "O Level" | "IGCSE" | "AS and A Level";
  /** For the booking box. */
  levelName: LevelName;
  name: string;
  exams: string;
  source: string;
  /** Older code this replaces, if any. */
  replaces?: string;
  /** Articles about changes for this syllabus. */
  changes?: string;
  topics: Topic[];
}

const S = (x: unknown) => x as Topic[];

export const SYLLABI: SyllabusInfo[] = [
  { code: "7707", slug: "o-level-accounting-7707", subject: "Accounting", level: "O Level", levelName: "O Level / IGCSE", name: "O Level Accounting 7707", exams: "2027, 2028 and 2029", source: "https://cambridgeinternational.org/Images/718213-2027-2029-syllabus.pdf", changes: "/blog/o-level-accounting-7707-syllabus-2027", topics: S(d7707) },
  { code: "2281", slug: "o-level-economics-2281", subject: "Economics", level: "O Level", levelName: "O Level / IGCSE", name: "O Level Economics 2281", exams: "2027, 2028 and 2029", source: "https://cambridgeinternational.org/Images/718206-2027-2029-syllabus.pdf", changes: "/blog/o-level-economics-2281-syllabus-2027-changes", topics: S(d2281) },
  { code: "7081", slug: "o-level-business-7081", subject: "Business", level: "O Level", levelName: "O Level / IGCSE", name: "O Level Business 7081", exams: "2027, 2028 and 2029", source: "https://cambridgeinternational.org/Images/718211-2027-2029-syllabus.pdf", replaces: "7115", changes: "/blog/o-level-business-7115-syllabus-explained", topics: S(d7081) },
  { code: "0452", slug: "igcse-accounting-0452", subject: "Accounting", level: "IGCSE", levelName: "O Level / IGCSE", name: "IGCSE Accounting 0452", exams: "2027, 2028 and 2029", source: "https://cambridgeinternational.org/Images/718141-2027-2029-syllabus.pdf", topics: S(d0452) },
  { code: "0455", slug: "igcse-economics-0455", subject: "Economics", level: "IGCSE", levelName: "O Level / IGCSE", name: "IGCSE Economics 0455", exams: "2027, 2028 and 2029", source: "https://cambridgeinternational.org/Images/718148-2027-2029-syllabus.pdf", topics: S(d0455) },
  { code: "0264", slug: "igcse-business-0264", subject: "Business", level: "IGCSE", levelName: "O Level / IGCSE", name: "IGCSE Business 0264", exams: "2027, 2028 and 2029", source: "https://cambridgeinternational.org/Images/718123-2027-2029-syllabus.pdf", replaces: "0450", topics: S(d0264) },
  { code: "9706", slug: "a-level-accounting-9706", subject: "Accounting", level: "AS and A Level", levelName: "AS Level", name: "AS and A Level Accounting 9706", exams: "2026, 2027 and 2028", source: "https://cambridgeinternational.org/Images/697417-2026-2028-syllabus.pdf", changes: "/blog/a-level-accounting-9706-syllabus-2027-changes", topics: S(d9706) },
  { code: "9708", slug: "a-level-economics-9708", subject: "Economics", level: "AS and A Level", levelName: "AS Level", name: "AS and A Level Economics 9708", exams: "2026, 2027 and 2028", source: "https://cambridgeinternational.org/Images/697423-2026-2028-syllabus.pdf", topics: S(d9708) },
  { code: "9609", slug: "a-level-business-9609", subject: "Business", level: "AS and A Level", levelName: "AS Level", name: "AS and A Level Business 9609", exams: "2026, 2027 and 2028", source: "https://cambridgeinternational.org/Images/697371-2026-2028-syllabus.pdf", topics: S(d9609) },
];

export const syllabusBySlug = (slug: string) => SYLLABI.find((s) => s.slug === slug) ?? null;
export const syllabusByCode = (code: string) => SYLLABI.find((s) => s.code === code) ?? null;

/**
 * Cambridge writes some points as a lead-in with sub-items ("including: – a –
 * b"). Split them so each sub-item is its own line (no dash characters shown).
 */
export function splitPoint(p: string): { lead: string; items: string[] } {
  const parts = p.split(/\s+[–-]\s+(?=[a-z(])/);
  if (parts.length < 3) return { lead: p.replace(/\s+–\s+/g, ", "), items: [] };
  return { lead: parts[0].replace(/:$/, ":"), items: parts.slice(1) };
}

export const subtopicCount = (s: SyllabusInfo) => s.topics.reduce((n, t) => n + t.subs.length, 0);
export const pointCount = (s: SyllabusInfo) =>
  s.topics.reduce((n, t) => n + t.subs.reduce((m, u) => m + u.parts.reduce((k, p) => k + Math.max(1, p.points.length), 0), 0), 0);

/** Free resources on the site that match a subtopic, by its words. */
const RESOURCES: Array<{ match: RegExp; href: string; label: string }> = [
  { match: /elasticit/i, href: "/tools/elasticity-calculator", label: "Elasticity calculator" },
  { match: /price elasticity of demand/i, href: "/blog/igcse-economics-price-elasticity-of-demand", label: "PED explained" },
  { match: /market failure|externalit|merit/i, href: "/blog/igcse-economics-market-failure", label: "Market failure explained" },
  { match: /depreciation|non-current assets/i, href: "/tools/depreciation-calculator", label: "Depreciation calculator" },
  { match: /depreciation/i, href: "/blog/a-level-accounting-depreciation-questions", label: "Depreciation questions, worked" },
  { match: /ratio|analysis and interpretation|interpretation/i, href: "/tools/ratio-calculator", label: "Ratio calculator" },
  { match: /break-even|break even|costs, scale of production/i, href: "/tools/break-even-calculator", label: "Break-even calculator" },
  { match: /investment appraisal/i, href: "/tools/investment-appraisal-calculator", label: "Investment appraisal calculator" },
  { match: /investment appraisal/i, href: "/blog/a-level-business-9609-investment-appraisal", label: "Investment appraisal, worked" },
  { match: /partnership/i, href: "/blog/igcse-accounting-partnership-accounts", label: "Partnership accounts, worked" },
  { match: /cash flows|statement of cash flows/i, href: "/blog/a-level-accounting-9706-statement-of-cash-flows", label: "Statement of cash flows, worked" },
  { match: /preparation of financial statements|sole traders|limited companies|clubs|manufacturing/i, href: "/blog/igcse-o-level-accounting-formats", label: "Every accounting format" },
  { match: /trial balance|verification/i, href: "/blog/igcse-accounting-trial-balance", label: "Trial balance, worked" },
];

export function resourcesFor(text: string): Array<{ href: string; label: string }> {
  const seen = new Set<string>();
  return RESOURCES.filter((r) => r.match.test(text) && !seen.has(r.href) && seen.add(r.href))
    .slice(0, 3)
    .map(({ href, label }) => ({ href, label }));
}
