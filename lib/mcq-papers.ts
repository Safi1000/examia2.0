/**
 * Past paper multiple-choice checker (/tools/past-paper-mcq). Students do a
 * real Cambridge Paper 1 (or A Level Paper 3) from the official PDF, then
 * mark it here. Cambridge owns the papers, so the site never shows their
 * questions: each paper is a link to the official PDF, the answer letters
 * from the official mark scheme, and, where Hamza has written them, his own
 * topic tags and explanations.
 *
 * Adding a paper: copy one entry in MCQ_PAPERS, set the links from the
 * syllabus's past papers page on cambridgeinternational.org, type the answer
 * key from the mark scheme as one string ("BDAC..."), and set `minutes` and
 * the question count from the paper's cover. `checkPapers()` rejects an entry
 * whose key does not match its question count.
 */
import type { SubjectName } from "@/lib/landing";

export type McqLevel = "IGCSE" | "O Level" | "AS Level" | "A Level";
export type Letter = "A" | "B" | "C" | "D";
export const LETTERS: Letter[] = ["A", "B", "C", "D"];

export interface McqSyllabus {
  slug: string;
  code: string;
  subject: Extract<SubjectName, "Accounting" | "Economics">;
  level: McqLevel;
  /** The multiple-choice component: Paper 1, or Paper 3 at A Level Economics. */
  paper: 1 | 3;
  /** Cambridge's past papers page for the syllabus. */
  pastPapers: string;
}

/**
 * Every Cambridge multiple-choice paper Hamza teaches. Business has no
 * multiple-choice paper, and A Level Accounting's multiple-choice paper is
 * the AS Paper 1 (Papers 3 and 4 are written).
 */
export const MCQ_SYLLABUSES: McqSyllabus[] = [
  { slug: "igcse-accounting-0452", code: "0452", subject: "Accounting", level: "IGCSE", paper: 1, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-accounting-0452/past-papers/" },
  { slug: "o-level-accounting-7707", code: "7707", subject: "Accounting", level: "O Level", paper: 1, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-o-level-accounting-7707/past-papers/" },
  { slug: "as-level-accounting-9706", code: "9706", subject: "Accounting", level: "AS Level", paper: 1, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-accounting-9706/past-papers/" },
  { slug: "igcse-economics-0455", code: "0455", subject: "Economics", level: "IGCSE", paper: 1, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-economics-0455/past-papers/" },
  { slug: "o-level-economics-2281", code: "2281", subject: "Economics", level: "O Level", paper: 1, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-o-level-economics-2281/past-papers/" },
  { slug: "as-level-economics-9708", code: "9708", subject: "Economics", level: "AS Level", paper: 1, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-economics-9708/past-papers/" },
  { slug: "a-level-economics-9708-paper-3", code: "9708", subject: "Economics", level: "A Level", paper: 3, pastPapers: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-economics-9708/past-papers/" },
];

export interface McqPaper {
  /** McqSyllabus.slug. */
  syllabus: string;
  /** "June 2024", "November 2025". */
  session: string;
  /** Component code on the cover, e.g. "11", "12", "31". */
  variant: string;
  /** Official question paper PDF. */
  questionPaper: string;
  /** Official mark scheme PDF the answers were typed from. */
  markScheme: string;
  /** Time allowed, from the cover. */
  minutes: number;
  /** One letter per question, in order, from the mark scheme. */
  answers: string;
  /** Optional: Hamza's topic tag for each question, same order as `answers`. */
  topics?: string[];
  /** Optional: Hamza's own explanation, by question number (1-based). Never Cambridge's wording. */
  notes?: Record<number, string>;
}

export const MCQ_PAPERS: McqPaper[] = [];

/** "june-2024-11" */
export const paperSlug = (p: McqPaper) => `${p.session.toLowerCase().replace(/\s+/g, "-")}-${p.variant}`;

/** Only papers whose data is complete and consistent reach the site. */
export function checkPapers(papers: McqPaper[]) {
  return papers.filter((p) => {
    const n = p.answers.length;
    const ok =
      MCQ_SYLLABUSES.some((s) => s.slug === p.syllabus) &&
      n > 0 &&
      /^[ABCD]+$/.test(p.answers) &&
      p.minutes > 0 &&
      (!p.topics || p.topics.length === n) &&
      Object.keys(p.notes ?? {}).every((k) => Number(k) >= 1 && Number(k) <= n);
    if (!ok && process.env.NODE_ENV !== "production") console.warn(`[mcq] skipped ${p.syllabus} ${p.session} ${p.variant}: data does not check out`);
    return ok;
  });
}

export const PAPERS = checkPapers(MCQ_PAPERS);

export const syllabusBySlug = (slug: string) => MCQ_SYLLABUSES.find((s) => s.slug === slug) ?? null;
export const papersFor = (slug: string) => PAPERS.filter((p) => p.syllabus === slug);
export const paperFor = (syllabus: string, slug: string) => papersFor(syllabus).find((p) => paperSlug(p) === slug) ?? null;
/** Syllabuses that have at least one paper; the only ones with live pages. */
export const liveSyllabuses = () => MCQ_SYLLABUSES.filter((s) => papersFor(s.slug).length > 0);

export const syllabusName = (s: McqSyllabus) => `${s.level} ${s.subject} ${s.code}`;
export const paperName = (s: McqSyllabus, p: McqPaper) => `${s.code}/${p.variant}, ${p.session}`;

/** Every tagged question for a syllabus, grouped by topic, for topic practice. */
export function topicQuestions(slug: string) {
  const out = new Map<string, Array<{ paper: McqPaper; n: number }>>();
  for (const paper of papersFor(slug)) {
    paper.topics?.forEach((t, i) => {
      if (!t) return;
      if (!out.has(t)) out.set(t, []);
      out.get(t)!.push({ paper, n: i + 1 });
    });
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Marks a set of answers. `given[i]` is the student's letter for question i + 1, or "" if blank. */
export function mark(paper: McqPaper, given: string[]) {
  const key = paper.answers.split("");
  const rows = key.map((correct, i) => ({ n: i + 1, correct, given: given[i] ?? "", right: given[i] === correct, topic: paper.topics?.[i] }));
  const score = rows.filter((r) => r.right).length;
  const byTopic = new Map<string, { right: number; total: number }>();
  for (const r of rows) {
    if (!r.topic) continue;
    const t = byTopic.get(r.topic) ?? { right: 0, total: 0 };
    t.total += 1;
    if (r.right) t.right += 1;
    byTopic.set(r.topic, t);
  }
  return {
    score,
    total: key.length,
    blanks: rows.filter((r) => !r.given).length,
    wrong: rows.filter((r) => !r.right),
    byTopic: [...byTopic.entries()].sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total),
  };
}
