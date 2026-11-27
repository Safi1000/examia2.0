/**
 * Search snippets and on-page facts for the past paper pages, built only from
 * the site's own data (lib/past-paper-meta.json, lib/past-paper-tags.json, the
 * syllabus lists and the blog). Nothing here is typed by hand: when a fact is
 * missing, the text leaves it out.
 *
 * Server only (the article list reads the blog folder).
 */
import meta from "@/lib/past-paper-meta.json";
import tags from "@/lib/past-paper-tags.json";
import { allArticles, type Article } from "@/lib/blog";
import {
  answerKey,
  paperNumbers,
  papersFor,
  sessionKey,
  sessionLabel,
  sessionsFor,
  thresholdsFor,
  type Paper,
  type PastPaperSyllabus,
} from "@/lib/past-papers";
import { hasTopical, topicalFor } from "@/lib/topical";

type Meta = {
  /** Written questions: [question number, page pieces]. */
  w: Record<string, Array<[number, number[][]]>>;
};
const M = meta as unknown as Meta;
const T = tags as unknown as Record<string, string[]>;

/** "1 hour 15 minutes" */
export const timeText = (m: number) =>
  m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} hour${m >= 120 ? "s" : ""}${m % 60 ? ` ${m % 60} minutes` : ""}`;

/** Longest snippet Google shows in full on most screens. */
const MAX = 158;

/** Written question numbers for a paper, in order (empty when the paper was never cut into questions). */
const writtenNumbers = (p: Paper) => (M.w?.[p.key] ?? []).map(([n]) => n).sort((a, b) => a - b);

/**
 * The meta description for one paper page. Opens with the exact paper, in the
 * words students search ("9706 May/June 2025 Paper 22" and the file style
 * "s25 qp 22, ms 22"), so no two papers share a snippet. Then the paper's own
 * facts (the A grade mark for this paper, its length, its questions or marks)
 * and what the page gives, while it fits in 140 to 158 characters.
 */
export function paperDescription(s: PastPaperSyllabus, p: Paper): string {
  const t = thresholdsFor(p);
  const a = t?.grades.find(([g]) => g === "A");
  const key = answerKey(p);
  const written = writtenNumbers(p);
  const count = key ? key.length : written.length;
  const sk = sessionKey(p.session);

  const name = `${s.code} ${sessionLabel(p.session)} Paper ${p.pv}`;
  const file = `${sk} qp ${p.pv}${p.ms ? `, ms ${p.pv}` : ""}`;

  const facts: string[] = [];
  if (a && t) facts.push(`A grade: ${a[1]} out of ${t.max}.`);
  const shape = [
    p.minutes ? timeText(p.minutes) : "",
    count ? `${count} question${count === 1 ? "" : "s"}` : "",
    p.marks && !(key && p.marks === count) ? `${p.marks} marks` : "",
  ].filter(Boolean);
  if (shape.length) facts.push(`${shape.join(", ")}.`);

  // Longest closing line that still fits.
  const closes = p.ms
    ? ["Question paper and mark scheme side by side, free.", "Paper and mark scheme free.", "Free."]
    : ["Question paper free to read online.", "Free to read."];

  const fits = (x: string) => x.length <= MAX;
  // The paper's name always leads; the file style name and the facts follow while they fit.
  let out = `${name} (${file}).`;
  if (!fits(`${out} ${closes.at(-1)}`)) out = `${name}.`;
  for (const f of facts) if (fits(`${out} ${f} ${closes.at(-1)}`)) out += ` ${f}`;
  out += ` ${closes.find((c) => fits(`${out} ${c}`)) ?? closes.at(-1)}`;

  // Extras, best first; each is added only while the snippet still fits.
  const extras = [
    key ? "Answer key included." : "",
    p.insert ? "Insert included." : "",
    p.session.er ? "Examiner report too." : "",
    key ? "Practise timed, marked instantly." : t ? "Practise timed and see your grade." : "",
    "No ads.",
  ].filter(Boolean);
  for (const e of extras) if (fits(`${out} ${e}`)) out += ` ${e}`;
  return out;
}

/** One row of the "Question by question" block. */
export interface QuestionRow {
  n: number;
  topics: Array<{ num: string; name: string; href: string }>;
  /** Multiple choice only: the letter, or "-" (removed by Cambridge) or "*" (mark given to everyone). */
  answer?: string;
}

/**
 * Every question on the paper with the syllabus topic it tests (the same tags
 * that file it on the topic pages) and, for multiple choice, its answer from
 * the mark scheme. Empty when the paper has no tags and no answer key.
 */
export function paperQuestions(s: PastPaperSyllabus, p: Paper): QuestionRow[] {
  const entries = new Map(
    topicalFor(s.code)
      .filter((e) => e.questions.length > 0)
      .map((e) => [e.sub.num, e] as const),
  );
  const key = answerKey(p);
  const numbers = key ? [...key].map((_, i) => i + 1) : writtenNumbers(p);
  // Multiple choice questions are filed under their main topic; written ones under up to two.
  const take = key ? 1 : 2;
  const rows = numbers.map((n) => {
    const topics = (T[`${p.key}#${n}`] ?? [])
      .slice(0, take)
      .map((num) => entries.get(num))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map((e) => ({ num: e.sub.num, name: e.sub.name, href: `/past-papers/${s.slug}/topics/${e.slug}` }));
    return { n, topics, ...(key ? { answer: key[n - 1] } : {}) };
  });
  return rows.some((r) => r.topics.length) || key ? rows : [];
}

/** First and last exam year held for a syllabus. */
export function yearSpan(code: string): { from: number; to: number } | null {
  const ys = sessionsFor(code).map((x) => x.y);
  return ys.length ? { from: Math.min(...ys), to: Math.max(...ys) } : null;
}

const codeWord = (s: PastPaperSyllabus) => (s.next ? `${s.code} and ${s.next.code}` : s.code);

/** "7707 Past Papers 2022 to 2026: Papers and Mark Schemes", shortened when it would pass 60 characters. */
export function hubTitle(s: PastPaperSyllabus): string {
  const y = yearSpan(s.code);
  const years = y ? (y.from === y.to ? `${y.to}` : `${y.from} to ${y.to}`) : "";
  const tries = [
    `${codeWord(s)} Past Papers ${years}: Papers and Mark Schemes`,
    `${s.code} Past Papers ${years}: Papers and Mark Schemes`,
    `${s.code} Past Papers ${years} and Mark Schemes`,
    `${s.name} Past Papers`,
  ].map((x) => x.replace(/\s+/g, " ").trim());
  return tries.find((x) => x.length <= 60) ?? tries[tries.length - 1];
}

/** "Paper 1 Multiple Choice and Paper 2 Structured Written Paper" */
function paperList(code: string): string {
  const list = paperNumbers(code).map((x) => `Paper ${x.num}${x.title ? ` ${x.title}` : ""}`);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : (list[0] ?? "");
}

/** The hub page's meta description. */
export function hubDescription(s: PastPaperSyllabus): string {
  const papers = papersFor(s.code);
  const y = yearSpan(s.code);
  const years = y ? (y.from === y.to ? ` from ${y.to}` : ` from ${y.from} to ${y.to}`) : "";
  const allMs = papers.length > 0 && papers.every((p) => p.ms);
  const head = `${papers.length} ${s.name} question papers${years}, ${allMs ? "each with its mark scheme" : "with mark schemes"}.`;
  const extras = [
    s.next ? `${s.next.code} replaces it from ${s.next.from}.` : s.revised ? `New syllabus from ${s.revised}.` : "",
    "Grade thresholds and examiner reports.",
    hasTopical(s.code) ? "Practise by topic." : "",
    "Free, no ads.",
  ].filter(Boolean);
  let out = head;
  for (const e of extras) if (out.length + 1 + e.length <= MAX) out += ` ${e}`;
  return out;
}

/**
 * The hub's two or three sentence introduction: which papers, which years,
 * what comes with them, and the 2027 change where the data says there is one.
 */
export function hubIntro(s: PastPaperSyllabus): string[] {
  const papers = papersFor(s.code);
  const sessions = sessionsFor(s.code);
  if (!papers.length || !sessions.length) return [];
  const newest = sessions[0];
  const oldest = sessions[sessions.length - 1];
  const withMs = papers.filter((p) => p.ms).length;
  const er = sessions.some((x) => x.er);
  const gt = sessions.some((x) => x.gt);
  const out = [
    `This page holds ${papers.length} ${s.name} question papers, from ${sessionLabel(oldest)} to ${sessionLabel(newest)}: ${paperList(s.code)}, in every variant Cambridge set.`,
    `${withMs === papers.length ? "Every paper opens with its mark scheme" : `${withMs} of them open with the mark scheme`} beside it${er || gt ? `, plus the ${[er ? "examiner report" : "", gt ? "grade thresholds" : ""].filter(Boolean).join(" and ")} for each series where Cambridge published them` : ""}.`,
  ];
  if (s.next) out.push(`From ${s.next.from}, ${s.code} is replaced by ${s.next.code}.`);
  else if (s.revised) out.push(`A revised ${s.code} syllabus applies to exams from ${s.revised}.`);
  return out;
}

/** Plain text with no em or en dashes (titles are shown as written otherwise). */
const noDash = (t: string) => t.replace(/\s*[–—]\s*/g, ": ");

/**
 * Up to two blog articles for a paper page: articles whose syllabus code line
 * names this syllabus, preferring ones about this paper number. An article
 * tied to a different paper number of this syllabus is skipped.
 */
export async function articlesForPaper(s: PastPaperSyllabus, p: Paper, limit = 2): Promise<Array<{ href: string; label: string }>> {
  const codes = [s.code, s.next?.code].filter((c): c is string => !!c);
  const list = await allArticles();
  const scored = list
    .map((a: Article) => {
      const hit = codes.find((c) => new RegExp(`\\b${c}\\b`).test(a.code));
      if (!hit) return null;
      // "9708 Paper 2 · 9609 Paper 3": the code line ties the article to one paper.
      const tied = a.code.match(new RegExp(`\\b${hit}\\s+Paper\\s+(\\d)`, "i"))?.[1];
      if (tied && tied !== p.num) return null;
      const inTitle = [...a.title.matchAll(/\bPaper\s+(\d)/gi)].map((m) => m[1]);
      if (!tied && inTitle.length && !inTitle.includes(p.num)) return null;
      const score = (tied === p.num ? 4 : 0) + (inTitle.includes(p.num) ? 4 : 0) + (a.type === "Exam technique" || a.type === "Past paper" ? 1 : 0);
      return { a, score };
    })
    .filter((x): x is { a: Article; score: number } => !!x)
    .sort((x, y) => y.score - x.score || (x.a.date < y.a.date ? 1 : -1));
  return scored.slice(0, limit).map(({ a }) => ({ href: `/blog/${a.slug}`, label: noDash(a.seoTitle ?? a.title) }));
}
