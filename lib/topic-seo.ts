/**
 * Search snippets and the short factual introduction for the topical past
 * paper pages (/past-papers/[slug]/topics and each topic under it). Built only
 * from data the site already holds: the page's own question list, the
 * Cambridge syllabus content (lib/syllabus-data) and the blog's article meta.
 * Plain British English, no dashes, no claims the data can't back.
 */
import type { Article } from "@/lib/blog";
import { codesLabel, type PastPaperSyllabus } from "@/lib/past-papers";
import type { SyllabusInfo } from "@/lib/syllabus";
import type { TopicEntry, TopicalQuestion } from "@/lib/topical";

/** Google shows about 60 characters of a title. */
export const TITLE_MAX = 60;
export const DESC_MIN = 140;
export const DESC_MAX = 158;

const SEASON: Record<string, string> = { m: "February/March", s: "May/June", w: "October/November" };
const SEASON_ORDER: Record<string, number> = { m: 0, s: 1, w: 2 };

const fmt = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
/** "1 and 3", "1, 2 and 3". */
const andList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** No en or em dashes anywhere in generated copy. */
const clean = (t: string) => t.replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();

const SMALL = new Set(["a", "an", "and", "as", "at", "between", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);
/** "incomplete records" → "Incomplete Records"; leaves "PED", "(HRM)" alone. */
export function titleCase(name: string): string {
  return clean(name)
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
/** For use mid-sentence: lower-cases the first letter of a word unless it is an acronym ("PED"). */
export function lowerName(name: string): string {
  return clean(name)
    .split(" ")
    .map((w) => (/^[(]?[A-Z]{2,}/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1)))
    .join(" ");
}
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** First candidate that fits a title; the last one cut at a word if none do. */
function fitTitleText(candidates: string[], max = TITLE_MAX): string {
  const hit = candidates.find((c) => c.length <= max);
  if (hit) return hit;
  const last = candidates[candidates.length - 1];
  return last.slice(0, max).replace(/\s+\S*$/, "");
}

/**
 * Picks the first candidate between DESC_MIN and DESC_MAX characters (the
 * candidates are in order of preference); else the longest that fits under
 * DESC_MAX; else the shortest cut at a word.
 */
export function fitDescription(candidates: string[], min = DESC_MIN, max = DESC_MAX): string {
  const list = candidates.map(clean);
  const inRange = list.find((c) => c.length >= min && c.length <= max);
  if (inRange) return inRange;
  const under = list.filter((c) => c.length <= max).sort((a, b) => b.length - a.length)[0];
  if (under) return under;
  const shortest = [...list].sort((a, b) => a.length - b.length)[0];
  return `${shortest.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}.`;
}

export interface TopicStats {
  n: number;
  mcq: number;
  written: number;
  /** Distinct exam series ("May/June 2025"). */
  series: number;
  years: number;
  minY: number;
  maxY: number;
  /** "May/June 2025". */
  newest: string;
  mcqPapers: string[];
  writtenPapers: string[];
}

export function topicStats(questions: TopicalQuestion[]): TopicStats {
  const series = new Set(questions.map((q) => `${q.y}${q.s}`));
  const years = [...new Set(questions.map((q) => q.y))].sort((a, b) => a - b);
  const newestQ = questions.reduce<TopicalQuestion | null>(
    (best, q) => (!best || q.y > best.y || (q.y === best.y && (SEASON_ORDER[q.s] ?? 0) > (SEASON_ORDER[best.s] ?? 0)) ? q : best),
    null,
  );
  const papers = (kind: TopicalQuestion["kind"]) => [...new Set(questions.filter((q) => q.kind === kind).map((q) => q.num))].sort();
  return {
    n: questions.length,
    mcq: questions.filter((q) => q.kind === "mcq").length,
    written: questions.filter((q) => q.kind === "written").length,
    series: series.size,
    years: years.length,
    minY: years[0] ?? 0,
    maxY: years[years.length - 1] ?? 0,
    newest: newestQ ? `${SEASON[newestQ.s] ?? ""} ${newestQ.y}`.trim() : "",
    mcqPapers: papers("mcq"),
    writtenPapers: papers("written"),
  };
}

const paperWord = (nums: string[]) => (nums.length === 1 ? `Paper ${nums[0]}` : `Papers ${andList(nums)}`);

/** Subtopic names that appear twice in one syllabus (9706, 9708) get their number, so titles stay unique. */
function displayName(e: TopicEntry, all: TopicEntry[]) {
  const dup = all.filter((x) => x.sub.name.toLowerCase() === e.sub.name.toLowerCase()).length > 1;
  return { name: e.sub.name, dupNum: dup ? e.sub.num : "" };
}

/** "Incomplete Records: 42 Past Paper Questions (7707)", within 60 characters. */
export function topicTitle(s: PastPaperSyllabus, e: TopicEntry, all: TopicEntry[]): string {
  const { name, dupNum } = displayName(e, all);
  const n = e.questions.length;
  const qs = n === 1 ? "Past Paper Question" : "Past Paper Questions";
  const shortQs = n === 1 ? "Question" : "Questions";
  const full = titleCase(name) + (dupNum ? ` ${dupNum}` : "");
  const noAcronym = titleCase(name.replace(/\s*\([^)]*\)\s*/g, " ")) + (dupNum ? ` ${dupNum}` : "");
  const both = codesLabel(s);
  const candidates = [
    `${full}: ${fmt(n)} ${qs} (${both})`,
    `${full}: ${fmt(n)} ${qs} (${s.code})`,
    `${noAcronym}: ${fmt(n)} ${qs} (${s.code})`,
    `${noAcronym}: ${fmt(n)} ${shortQs} (${s.code})`,
    `${noAcronym.replace(/\b[Tt]he /g, "")}: ${fmt(n)} ${shortQs} (${s.code})`,
  ];
  const hit = candidates.find((c) => c.length <= TITLE_MAX);
  if (hit) return hit;
  // Long subtopic names: shorten the name at a word, keep the count and the code.
  const tail = `: ${fmt(n)} ${shortQs} (${s.code})`;
  const room = TITLE_MAX - tail.length;
  const cut = noAcronym
    .slice(0, room + 1)
    .replace(/\s+\S*$/, "")
    .replace(/[\s,]+(?:and|of|for|to|the|in|a|an|or|with|between)$/i, "")
    .replace(/[\s,]+$/, "");
  return fitTitleText([`${cut}${tail}`]);
}

const kindsWord = (st: TopicStats) =>
  st.mcq && st.written ? "multiple choice and written" : st.mcq ? "multiple choice" : "written";

/** 140 to 158 characters: what is on the page, the count, the newest series, "with mark schemes". */
export function topicDescription(s: PastPaperSyllabus, e: TopicEntry, all: TopicEntry[]): string {
  const st = topicStats(e.questions);
  const { name, dupNum } = displayName(e, all);
  const lname = lowerName(name) + (dupNum ? ` (${dupNum})` : "");
  const names = [s.next ? `${s.name} and ${s.next.code}` : s.name, s.name, s.short, s.code];
  const qs = st.n === 1 ? "past paper question" : "past paper questions";
  const ms = st.n === 1 ? "with the mark scheme" : "with mark schemes";
  const kinds = [`, ${kindsWord(st)}`, ""];
  const series =
    st.series === 1
      ? [`, from ${st.newest}`]
      : [`, from ${fmt(st.series)} exam series up to ${st.newest}`, `, from ${fmt(st.series)} series up to ${st.newest}`, `, newest ${st.newest}`];
  const order = st.n > 1 ? [", newest first", ""] : [""];
  const tails = [st.mcq ? " Answer the MCQs on screen. Free." : " Free, no sign up needed.", " Free, no ads.", " Free.", ""];
  // Every combination, most informative first; fitDescription takes the first between 140 and 158 characters.
  const out: string[] = [];
  for (const nm of names)
    for (const k of kinds)
      for (const sr of series)
        for (const o of order)
          for (const t of tails) out.push(`${fmt(st.n)} ${nm} ${qs} on ${lname}${k}${sr}${o}, ${ms}.${t}`);
  return fitDescription(out);
}

/** Short syllabus points, cleaned for a sentence (no dashes, no lead-in lists). */
function usablePoints(e: TopicEntry, maxLen: number): string[] {
  return e.sub.parts
    .flatMap((p) => p.points)
    .filter((p) => !/[–—]/.test(p) && !/:\s*$/.test(p))
    .map((p) => clean(p).replace(/[.;:,]+$/, ""))
    .filter((p) => p.length <= maxLen)
    .map(lowerFirst);
}

/** The syllabus sentence: what Cambridge lists under this subtopic. */
function syllabusSentence(e: TopicEntry, syl: SyllabusInfo | null, maxPoints: number, maxParts = 3): string {
  const who = syl ? `The ${syl.name} syllabus` : "The Cambridge syllabus";
  const lname = lowerName(e.sub.name);
  const parts = e.sub.parts.filter((p) => p.name && p.name.trim().toLowerCase() !== e.sub.name.trim().toLowerCase());
  if (e.sub.parts.length > 1 && parts.length > 1) {
    const names = parts.map((p) => lowerFirst(clean(p.name).replace(/[.;:,]+$/, "")));
    const sep = names.some((x) => x.includes(",")) ? "; " : ", ";
    const cap = Math.max(1, maxParts);
    const shown = names.length > cap + 1 ? names.slice(0, cap) : names;
    const list =
      names.length > cap + 1
        ? `${shown.join(sep)}${sep}and ${names.length - cap} more`
        : `${shown.slice(0, -1).join(sep)}${sep === "; " ? ";" : ""} and ${shown[shown.length - 1]}`;
    return `${who} splits ${lname} into ${names.length} parts: ${list}.`;
  }
  const total = e.sub.parts.reduce((k, p) => k + p.points.length, 0);
  const pts = usablePoints(e, 85).slice(0, maxPoints);
  if (total && pts.length)
    return `${who} lists ${plural(total, "learning point")} for ${lname}, including ${andList(pts)}.`;
  return `${who} covers ${lname} under topic ${e.topic.num}, ${lowerName(e.topic.name)}.`;
}

/**
 * Two to four plain sentences for the top of a topic page: what the syllabus
 * asks, how often the topic came up (counted from this page's questions), and
 * what kind of questions they are.
 */
export function topicIntro(s: PastPaperSyllabus, e: TopicEntry, syl: SyllabusInfo | null): string[] {
  const st = topicStats(e.questions);
  const qWord = st.n === 1 ? "past paper question" : "past paper questions";
  const when =
    st.series === 1
      ? `from the ${st.newest} exams`
      : `from ${fmt(st.series)} exam series across ${plural(st.years, "year")}, ${st.minY} to ${st.maxY}, newest first`;
  const count = `This page has ${fmt(st.n)} ${s.name} ${qWord} on ${lowerName(e.sub.name)}, ${when}.`;
  const kinds =
    st.mcq && st.written
      ? `${fmt(st.mcq)} ${st.mcq === 1 ? "is" : "are"} multiple choice from ${paperWord(st.mcqPapers)}, which you can answer on screen, and ${fmt(st.written)} ${st.written === 1 ? "is a written question" : "are written questions"} from ${paperWord(st.writtenPapers)}, each with its mark scheme.`
      : st.mcq
        ? `${st.n === 1 ? "It is a multiple choice question" : "All of them are multiple choice questions"} from ${paperWord(st.mcqPapers)}, which you can answer on screen.`
        : `${st.n === 1 ? "It is a written question" : "All of them are written questions"} from ${paperWord(st.writtenPapers)}, each with its mark scheme.`;
  const renamed = s.next && syl ? `Older ${s.code} questions are filed under the new ${syl.code} syllabus topics.` : "";
  const where = renamed ? "" : `It sits in topic ${e.topic.num} of the syllabus, ${lowerName(e.topic.name)}.`;
  const words = (xs: string[]) => xs.join(" ").split(/\s+/).filter(Boolean).length;
  let out: string[] = [];
  for (const [maxPoints, maxParts] of [[2, 3], [2, 2], [1, 1], [0, 1]]) {
    out = [syllabusSentence(e, syl, maxPoints, maxParts), count, kinds, renamed].filter(Boolean);
    if (words(out) <= 120) break;
  }
  // Very short pages (one or two questions) get the topic it belongs to, so the intro still says something useful.
  if (where && words(out) < 60 && words([...out, where]) <= 120) out.push(where);
  return out.map(clean);
}

/* Blog articles that clearly match a topic. */

const GENERIC = new Set(
  (
    "about account accounting accounts after also answer answers business change changes choice code economic economics every example examples " +
    "explain explained financial format formats formula formulas from full grade guide igcse into introduction level levels market markets mark marks " +
    "method methods multiple paper papers parent parents practice question questions score statement statements step steps " +
    "syllabus system systems threshold thresholds tips type types what when which with worked your their other different"
  ).split(" "),
);
const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const tokens = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .split(/[^a-z]+/)
      .map(stem)
      .filter((w) => w.length >= 4 && !GENERIC.has(w)),
  );

/** "IGCSE 0452 · O Level 7707" contains the page's code (or its new code). */
const coversCode = (a: Article, s: PastPaperSyllabus) =>
  [s.code, s.next?.code].filter(Boolean).some((c) => new RegExp(`\\b${c}\\b`).test(a.code));

/**
 * Up to two articles for the same syllabus code whose slug's distinctive words
 * all appear in the subtopic name ("Bank reconciliation" →
 * igcse-o-level-accounting-bank-reconciliation). Skips hrefs already on the page.
 */
export function topicArticles(s: PastPaperSyllabus, e: TopicEntry, articles: Article[], skip: string[] = []): Array<{ href: string; label: string }> {
  // Every distinctive word of the article's slug must be in the subtopic name: "price-elasticity-of-demand"
  // matches "Price elasticity of demand (PED)" but not "Price elasticity of supply (PES)".
  const want = tokens(e.sub.name);
  if (!want.size) return [];
  return articles
    .filter((a) => coversCode(a, s) && !skip.includes(`/blog/${a.slug}`))
    .map((a) => ({ a, have: [...tokens(a.slug)] }))
    .filter((x) => x.have.length > 0 && x.have.every((w) => want.has(w)))
    .sort((x, y) => y.have.length - x.have.length)
    .slice(0, 2)
    .map(({ a }) => ({ href: `/blog/${a.slug}`, label: clean(a.title.replace(/\s*\([^)]*\)\s*$/, "")) }));
}

/* Topic index pages. */

/** Distinct questions across a syllabus (a written question can sit under two subtopics). */
export function indexStats(entries: TopicEntry[]) {
  const ids = new Set<string>();
  const years = new Set<number>();
  for (const e of entries)
    for (const q of e.questions) {
      ids.add(q.id);
      years.add(q.y);
    }
  const ys = [...years].sort((a, b) => a - b);
  return { questions: ids.size, topics: entries.filter((e) => e.questions.length).length, minY: ys[0] ?? 0, maxY: ys[ys.length - 1] ?? 0 };
}

export function topicIndexTitle(s: PastPaperSyllabus, entries: TopicEntry[], searchName: string): string {
  const { questions } = indexStats(entries);
  const n = fmt(questions);
  return fitTitleText([
    `${searchName} Topical Past Papers: ${n} Questions`,
    `${s.name} Topical Past Papers: ${n} Questions`,
    `${s.name} Topical Past Papers (${n} Questions)`,
    `${s.level === "AS and A Level" ? "A Level" : s.level} ${s.short} Topical Past Papers: ${n} Questions`,
    `${s.short} Topical Past Papers: ${n} Questions`,
  ]);
}

export function topicIndexDescription(s: PastPaperSyllabus, entries: TopicEntry[]): string {
  const st = indexStats(entries);
  const name = s.next ? `${s.name} and ${s.next.code}` : s.name;
  const years = st.minY === st.maxY ? `${st.maxY}` : `${st.minY} to ${st.maxY}`;
  const base = `${fmt(st.questions)} ${name} past paper questions sorted into ${st.topics} syllabus topics, ${years}, with mark schemes.`;
  return fitDescription([
    `${base} Answer multiple choice on screen. Free, no ads.`,
    `${base} Answer MCQs on screen. Free, no ads.`,
    `${base} Free, no ads.`,
    `${base} Free.`,
    base,
  ]);
}

export function topicsHubDescription(all: Array<{ s: PastPaperSyllabus; entries: TopicEntry[] }>): string {
  const total = all.reduce((n, x) => n + indexStats(x.entries).questions, 0);
  const base = `${fmt(total)} Cambridge O Level, IGCSE and A Level Accounting, Business and Economics past paper questions sorted by syllabus topic, with mark schemes.`;
  return fitDescription([`${base} Free, no ads.`, `${base} Free.`, base]);
}
