/**
 * Topical past papers: every Paper 1 and Paper 2 question (and the A Level
 * multiple choice papers) filed under the syllabus subtopic it tests.
 *
 * Data:
 * - lib/past-paper-tags.json: question id ("0455_s25_22#3") → subtopic numbers,
 *   main one first. Tagged question by question against the current
 *   (2027 to 2029) Cambridge syllabus; older 0450/7115 papers are filed under
 *   the new 0264/7081 topics.
 * - lib/past-paper-meta.json: where each question sits on the page images
 *   (q = multiple choice, w = written).
 */
import tags from "@/lib/past-paper-tags.json";
import meta from "@/lib/past-paper-meta.json";
import { SYLLABI, type SyllabusInfo, type Subtopic, type Topic } from "@/lib/syllabus";
import { PAST_PAPER_SYLLABI, cieCode, fileName, pageUrl, paperHref, papersFor, syllabusByPaperCode, type PastPaperSyllabus } from "@/lib/past-papers";

type Meta = {
  k: Record<string, string>;
  q: Record<string, number[][]>;
  w: Record<string, Array<[number, number[][]]>>;
  /** Written question id → the mark scheme page where its answers start. */
  m: Record<string, number>;
};
const M = meta as unknown as Meta;
const T = tags as unknown as Record<string, string[]>;

/** One cut-out piece of a page image. */
export interface Seg {
  img: string;
  t: number;
  b: number;
  r: number;
}

export interface TopicalQuestion {
  /** "0455_s25_22#3" */
  id: string;
  kind: "mcq" | "written";
  /** "0455/22/M/J/25" */
  c: string;
  n: number;
  y: number;
  /** m, s or w */
  s: string;
  /** Paper number: "1", "2", "3". */
  num: string;
  /** The full paper's page. */
  href: string;
  segs: Seg[];
  /** Multiple choice answer. */
  a?: string;
  /** Mark scheme page with this question's answers. */
  ms?: number;
}

export interface TopicEntry {
  topic: Topic;
  sub: Subtopic;
  slug: string;
  questions: TopicalQuestion[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** The syllabus content a past paper syllabus is taught from now (0450 → 0264, 7115 → 7081). */
export function currentSyllabus(s: PastPaperSyllabus): SyllabusInfo | null {
  return SYLLABI.find((x) => x.code === s.code) ?? SYLLABI.find((x) => x.replaces === s.code) ?? null;
}

export const subtopicSlug = (sub: Subtopic) => `${sub.num.replace(/\./g, "-")}-${slugify(sub.name)}`;

const cache = new Map<string, TopicEntry[]>();

/** Every subtopic of the syllabus with the questions filed under it, newest first. */
export function topicalFor(code: string): TopicEntry[] {
  const hit = cache.get(code);
  if (hit) return hit;
  const s = syllabusByPaperCode(code);
  const syl = s ? currentSyllabus(s) : null;
  if (!s || !syl) return [];
  const bySub = new Map<string, TopicalQuestion[]>();
  for (const p of papersFor(code)) {
    const name = fileName(p.code, p.session, "qp", p.pv);
    const base = { c: cieCode(p), y: p.session.y, s: p.session.s, num: p.num, href: paperHref(s.slug, p) };
    const key = M.k[p.key];
    const mcq = M.q?.[p.key];
    if (mcq && key) {
      mcq.forEach(([page, t, b, r], i) => {
        const id = `${p.key}#${i + 1}`;
        const subs = T[id];
        if (!subs?.length || key[i] === "-" || key[i] === "*") return;
        const q: TopicalQuestion = { ...base, id, kind: "mcq", n: i + 1, segs: [{ img: pageUrl(name, page), t, b, r: r ?? 1.414 }], a: key[i] };
        for (const sub of subs.slice(0, 1)) bySub.set(sub, [...(bySub.get(sub) ?? []), q]);
      });
    }
    for (const [n, segs] of M.w?.[p.key] ?? []) {
      const id = `${p.key}#${n}`;
      const subs = T[id];
      if (!subs?.length) continue;
      const q: TopicalQuestion = { ...base, id, kind: "written", n, ms: M.m?.[id], segs: segs.map(([page, t, b]) => ({ img: pageUrl(name, page), t, b, r: 1.414 })) };
      for (const sub of subs.slice(0, 2)) bySub.set(sub, [...(bySub.get(sub) ?? []), q]);
    }
  }
  const out: TopicEntry[] = [];
  for (const topic of syl.topics)
    for (const sub of topic.subs) out.push({ topic, sub, slug: subtopicSlug(sub), questions: bySub.get(sub.num) ?? [] });
  cache.set(code, out);
  return out;
}

export const topicEntry = (code: string, slug: string) => topicalFor(code).find((e) => e.slug === slug) ?? null;
export const hasTopical = (code: string) => topicalFor(code).some((e) => e.questions.length > 0);

/**
 * The topical page for a syllabus subtopic, if it has questions. Works from the
 * syllabus checklist's code too: 0264 and 7081 point at the 0450 and 7115 papers.
 */
export function topicalHrefFor(syllabusCode: string, subNum: string): string | null {
  const s = PAST_PAPER_SYLLABI.find((p) => p.code === syllabusCode || p.next?.code === syllabusCode);
  if (!s) return null;
  const e = topicalFor(s.code).find((x) => x.sub.num === subNum && x.questions.length);
  return e ? `/past-papers/${s.slug}/topics/${e.slug}` : null;
}

/** Topics a paper's questions test, in syllabus order (for "Topics in this paper"). */
export function topicsInPaper(code: string, paperKey: string): TopicEntry[] {
  return topicalFor(code).filter((e) => e.questions.some((q) => q.id.startsWith(`${paperKey}#`)));
}
