/**
 * Past paper practice feed for the phone app: static JSON built at deploy.
 *   /api/practice         → PracticeIndex (every syllabus)
 *   /api/practice/<code>  → PracticePack (one syllabus: topics, papers, MCQs)
 *
 * The shapes must match the app's contract exactly:
 * mobile/src/lib/practice/types.ts. Keep the two in step.
 *
 * Built from the past paper library (lib/past-papers.ts, which already drops
 * held-back files), the answer keys and question crops in
 * lib/past-paper-meta.json, the subtopic tags in lib/past-paper-tags.json and
 * the current syllabus topics (lib/syllabus.ts; 0450 and 7115 use the 0264 and
 * 7081 topics, like the topical pages).
 */
import meta from "@/lib/past-paper-meta.json";
import tags from "@/lib/past-paper-tags.json";
import {
  PAST_PAPER_SYLLABI,
  fileName,
  pageCount,
  pageRatios,
  paperTitle,
  papersFor,
  syllabusByPaperCode,
  thresholdsFor,
  type PastPaperSyllabus,
} from "@/lib/past-papers";
import { currentSyllabus } from "@/lib/topical";

// ---------- The contract (mirrors mobile/src/lib/practice/types.ts) ----------

type Level = "O Level" | "IGCSE" | "AS & A Level";
type Subject = "Accounting" | "Business" | "Economics";
type Series = "m" | "s" | "w";
type Letter = "A" | "B" | "C" | "D";

export interface SyllabusSummary {
  code: string;
  nextCode?: string;
  level: Level;
  subject: Subject;
  name: string;
  mcqCount: number;
  paperCount: number;
}

export interface PracticeIndex {
  builtAt: string;
  syllabi: SyllabusSummary[];
}

export interface Topic {
  num: string;
  name: string;
  unit?: string;
}

export interface Threshold {
  max: number;
  grades: { grade: string; min: number }[];
}

export interface Question {
  id: string;
  n: number;
  page: number;
  top: number;
  bottom: number;
  key: Letter;
  topics: string[];
}

export interface Paper {
  key: string;
  year: number;
  series: Series;
  variant: string;
  title: string;
  kind: "mcq" | "written";
  marks: number | null;
  minutes: number | null;
  qp: string;
  ms?: string;
  insert?: string;
  pages: number;
  ratios: number[] | null;
  thresholds: Threshold | null;
  questions?: Question[];
}

export interface PracticePack {
  builtAt: string;
  syllabus: SyllabusSummary;
  topics: Topic[];
  papers: Paper[];
}

// ---------- Builder ----------

type Meta = { k: Record<string, string>; q: Record<string, number[][]> };
const M = meta as unknown as Meta;
const T = tags as unknown as Record<string, string[]>;

/** One build time for the whole deploy. */
const BUILT_AT = new Date().toISOString();

const LEVEL: Record<PastPaperSyllabus["level"], Level> = { "O Level": "O Level", IGCSE: "IGCSE", "AS and A Level": "AS & A Level" };
const isLetter = (c: string | undefined): c is Letter => c === "A" || c === "B" || c === "C" || c === "D";

/** Every subtopic of the syllabus the papers are tagged against, in syllabus order. */
function topicsFor(s: PastPaperSyllabus): Topic[] {
  const syl = currentSyllabus(s);
  if (!syl) return [];
  return syl.topics.flatMap((t) => t.subs.map((sub) => ({ num: sub.num, name: sub.name, unit: `${t.num} ${t.name}` })));
}

/** Papers newest series first (then by paper and variant), with MCQ questions where they can be shown. */
function papersOf(s: PastPaperSyllabus, valid: Set<string>): Paper[] {
  return papersFor(s.code).map((p) => {
    const qp = fileName(p.code, p.session, "qp", p.pv);
    const t = thresholdsFor(p);
    const key = M.k[p.key];
    const crops = M.q?.[p.key];
    const questions: Question[] = [];
    if (key && crops)
      crops.forEach(([page, top, bottom], i) => {
        const a = key[i];
        if (!isLetter(a)) return; // "-" / "*": question Cambridge removed
        const id = `${p.key}#${i + 1}`;
        questions.push({ id, n: i + 1, page, top, bottom, key: a, topics: (T[id] ?? []).filter((n) => valid.has(n)) });
      });
    return {
      key: p.key,
      year: p.session.y,
      series: p.session.s,
      variant: p.pv,
      title: paperTitle(p),
      kind: key ? "mcq" : "written",
      marks: p.marks,
      minutes: p.minutes,
      qp,
      ...(p.ms ? { ms: fileName(p.code, p.session, "ms", p.pv) } : {}),
      ...(p.insert ? { insert: fileName(p.code, p.session, "in", p.pv) } : {}),
      pages: pageCount(qp),
      ratios: pageRatios(qp),
      thresholds: t ? { max: t.max, grades: t.grades.filter(([g]) => g !== "A*").map(([grade, min]) => ({ grade, min })) } : null,
      ...(questions.length ? { questions } : {}),
    };
  });
}

function summary(s: PastPaperSyllabus, papers: Paper[]): SyllabusSummary {
  return {
    code: s.code,
    ...(s.next ? { nextCode: s.next.code } : {}),
    level: LEVEL[s.level],
    subject: s.subject as Subject,
    name: s.name.replace(/\s+\d{4}$/, "").replace("AS and A Level", "AS & A Level"),
    mcqCount: papers.reduce((n, p) => n + (p.questions?.length ?? 0), 0),
    paperCount: papers.length,
  };
}

const packs = new Map<string, PracticePack>();

/** One syllabus's practice pack, or null for an unknown code. */
export function practicePack(code: string): PracticePack | null {
  const hit = packs.get(code);
  if (hit) return hit;
  const s = syllabusByPaperCode(code);
  if (!s) return null;
  const topics = topicsFor(s);
  const papers = papersOf(s, new Set(topics.map((t) => t.num)));
  const pack: PracticePack = { builtAt: BUILT_AT, syllabus: summary(s, papers), topics, papers };
  packs.set(code, pack);
  return pack;
}

export function practiceIndex(): PracticeIndex {
  return { builtAt: BUILT_AT, syllabi: PAST_PAPER_SYLLABI.map((s) => practicePack(s.code)!.syllabus) };
}

export const PRACTICE_CODES = PAST_PAPER_SYLLABI.map((s) => s.code);

export const PRACTICE_HEADERS = { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" };
