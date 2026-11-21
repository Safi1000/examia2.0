/**
 * "Most repeated topics" for a syllabus: how often each syllabus subtopic has
 * come up in the past papers on this site, counted from the site's own
 * question tags (lib/past-paper-tags.json, the same tags the topical pages use).
 *
 * Counting rules (the page's "About these counts" repeats them):
 * - Each question counts once, under its MAIN tagged subtopic only. The topic
 *   pages also list a written question under its second topic, so a topic
 *   page can show more questions than its count here.
 * - Every variant of a paper counts (Paper 1 variant 1, 2 and 3 are separate
 *   question papers with different questions).
 * - A "series" is one exam session (May/June 2024). A topic "appeared" in a
 *   series if at least one question from any variant in that series is tagged
 *   to it. The total is the series that have tagged questions for the paper
 *   being looked at.
 * - Multiple choice questions Cambridge removed from marking are left out,
 *   as are questions without a tag.
 */
import tags from "@/lib/past-paper-tags.json";
import meta from "@/lib/past-paper-meta.json";
import { papersFor, sessionKey, paperNumbers, type PastPaperSyllabus } from "@/lib/past-papers";
import { topicalFor } from "@/lib/topical";
import { fitDescription, titleCase } from "@/lib/topic-seo";

const T = tags as unknown as Record<string, string[]>;
const M = meta as unknown as { q: Record<string, number[][]>; w: Record<string, Array<[number, number[][]]>> };

/** Counts for one paper scope ("all", "1", "2"...). */
export interface Count {
  q: number;
  series: number;
}

export interface RepeatRow {
  subNum: string;
  subName: string;
  topicNum: string;
  topicName: string;
  href: string;
  by: Record<string, Count>;
}

export interface Scope {
  /** "all" or the paper number. */
  id: string;
  label: string;
  /** "multiple choice" / "written" / "multiple choice and written". */
  kind: string;
  questions: number;
  /** Series with tagged questions in this scope. */
  series: number;
}

export interface RepeatedTopics {
  rows: RepeatRow[];
  scopes: Scope[];
  /** Series names in this data, oldest first: "May/June 2022"... */
  firstYear: number;
  lastYear: number;
  /** Question papers (every variant) that had tagged questions. */
  papers: number;
  /** Multiple choice questions removed by Cambridge, left out. */
  removed: number;
  /** Questions on the papers with no topic tag, left out. */
  untagged: number;
}

const cache = new Map<string, RepeatedTopics>();

export function repeatedTopics(s: PastPaperSyllabus): RepeatedTopics {
  const hit = cache.get(s.code);
  if (hit) return hit;
  const entries = topicalFor(s.code);
  const bySub = new Map(entries.map((e) => [e.sub.num, e]));
  // subtopic → scope → series keys, and question counts.
  const qs = new Map<string, Map<string, number>>();
  const ser = new Map<string, Map<string, Set<string>>>();
  const scopeQ = new Map<string, number>();
  const scopeSeries = new Map<string, Set<string>>();
  const scopeKinds = new Map<string, Set<string>>();
  const paperKeys = new Set<string>();
  let removed = 0;
  let untagged = 0;
  const years: number[] = [];

  const add = (sub: string, num: string, series: string, kind: string, paperKey: string) => {
    if (!bySub.has(sub)) {
      untagged++;
      return;
    }
    paperKeys.add(paperKey);
    years.push(Number(`20${series.slice(1)}`));
    for (const scope of ["all", num]) {
      const q = qs.get(sub) ?? new Map<string, number>();
      q.set(scope, (q.get(scope) ?? 0) + 1);
      qs.set(sub, q);
      const sr = ser.get(sub) ?? new Map<string, Set<string>>();
      sr.set(scope, (sr.get(scope) ?? new Set()).add(series));
      ser.set(sub, sr);
      scopeQ.set(scope, (scopeQ.get(scope) ?? 0) + 1);
      scopeSeries.set(scope, (scopeSeries.get(scope) ?? new Set()).add(series));
      scopeKinds.set(scope, (scopeKinds.get(scope) ?? new Set()).add(kind));
    }
  };

  const K = (meta as unknown as { k: Record<string, string> }).k;
  for (const p of papersFor(s.code)) {
    const series = sessionKey(p.session);
    const found: Array<[string | undefined, string]> = [];
    let gone = 0;
    const key = K[p.key];
    if (M.q?.[p.key] && key)
      M.q[p.key].forEach((_, i) => {
        if (key[i] === "-" || key[i] === "*") gone++;
        else found.push([T[`${p.key}#${i + 1}`]?.[0], "multiple choice"]);
      });
    for (const [n] of M.w?.[p.key] ?? []) found.push([T[`${p.key}#${n}`]?.[0], "written"]);
    // Papers the tags do not cover at all are left out entirely; gaps are only counted inside tagged papers.
    if (!found.some(([sub]) => sub && bySub.has(sub))) continue;
    removed += gone;
    for (const [sub, kind] of found) {
      if (sub) add(sub, p.num, series, kind, p.key);
      else untagged++;
    }
  }

  const base = `/past-papers/${s.slug}/topics`;
  const rows: RepeatRow[] = entries
    .filter((e) => qs.has(e.sub.num))
    .map((e) => {
      const by: Record<string, Count> = {};
      for (const [scope, n] of qs.get(e.sub.num)!) by[scope] = { q: n, series: ser.get(e.sub.num)!.get(scope)!.size };
      return {
        subNum: e.sub.num,
        subName: e.sub.name,
        topicNum: e.topic.num,
        topicName: e.topic.name,
        // Every subtopic with a main-tagged question has a topic page (it lists main and second tags).
        href: `${base}/${e.slug}`,
        by,
      };
    });

  const titles = new Map(paperNumbers(s.code).map((p) => [p.num, p.title]));
  const nums = [...scopeQ.keys()].filter((k) => k !== "all").sort();
  const kindOf = (scope: string) => {
    const k = scopeKinds.get(scope) ?? new Set<string>();
    return k.size > 1 ? "multiple choice and written" : ([...k][0] ?? "");
  };
  const scopes: Scope[] = [
    { id: "all", label: "All papers", kind: kindOf("all"), questions: scopeQ.get("all") ?? 0, series: scopeSeries.get("all")?.size ?? 0 },
    ...nums.map((n) => ({
      id: n,
      label: `Paper ${n}`,
      kind: titles.get(n) ? titles.get(n)!.toLowerCase() : kindOf(n),
      questions: scopeQ.get(n) ?? 0,
      series: scopeSeries.get(n)?.size ?? 0,
    })),
  ];
  const out: RepeatedTopics = {
    rows,
    scopes,
    firstYear: years.length ? Math.min(...years) : 0,
    lastYear: years.length ? Math.max(...years) : 0,
    papers: paperKeys.size,
    removed,
    untagged,
  };
  cache.set(s.code, out);
  return out;
}

/** Rows that appear in a scope, most questions first, then most series, then syllabus order. */
export function ranked(rows: RepeatRow[], scope: string): RepeatRow[] {
  return rows
    .filter((r) => r.by[scope]?.q)
    .toSorted((a, b) => b.by[scope].q - a.by[scope].q || b.by[scope].series - a.by[scope].series);
}

const fmt = (n: number) => n.toLocaleString("en-GB");
const years = (d: RepeatedTopics) => (d.firstYear === d.lastYear ? `${d.firstYear}` : `${d.firstYear} to ${d.lastYear}`);

/** "7707 Most Repeated Topics: Counted From Every Past Paper", 60 characters at most. */
export function repeatedTitle(s: PastPaperSyllabus): string {
  const c = s.next ? `${s.code}/${s.next.code}` : s.code;
  const options = [`${c} Most Repeated Topics: Counted From Every Past Paper`, `${c} Most Repeated Topics: Counted From Past Papers`, `${c} Most Repeated Topics in Past Papers`, `${s.code} Most Repeated Topics`];
  return options.find((t) => t.length <= 60) ?? options[options.length - 1];
}

export function repeatedDescription(s: PastPaperSyllabus, d: RepeatedTopics): string {
  const top = ranked(d.rows, "all");
  const all = d.scopes[0];
  const a = top[0];
  const b = top[1];
  const name = (r: RepeatRow) => titleCase(r.subName);
  const lead = `${fmt(all.questions)} ${s.short} past paper questions, ${years(d)}, counted by topic.`;
  return fitDescription([
    a && b ? `${lead} ${name(a)} tops the list with ${a.by.all.q}, then ${name(b)} with ${b.by.all.q}. See every topic ranked.` : "",
    a ? `${lead} ${name(a)} tops the list with ${a.by.all.q} questions. See every topic ranked by paper.` : "",
    a ? `${lead} ${name(a)} comes up most, ${a.by.all.q} times. See the full ranking.` : "",
    a ? `${lead} Top topic: ${a.by.all.q} questions. See every topic ranked.` : "",
    `${lead} See which topics come up most in each paper, ranked from most to least.`,
    `${lead} See which topics come up most in each paper, ranked.`,
  ].filter(Boolean));
}

/** "Counted from 640 past paper questions, 2022 to 2025." */
export const countedLine = (d: RepeatedTopics) => `Counted from ${fmt(d.scopes[0].questions)} past paper questions, ${years(d)}.`;
