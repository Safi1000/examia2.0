import {
  PAST_PAPER_SYLLABI,
  papersFor,
  seriesHref,
  sessionKey,
  sessionLabel,
  sessionsFor,
  thresholdsFor,
  type ComponentThresholds,
  type Paper,
  type PaperSession,
  type PastPaperSyllabus,
} from "@/lib/past-papers";
import { EXAMINER_REPORTS, type ExaminerReport } from "@/lib/examiner-reports";
import { topicalFor, type TopicEntry } from "@/lib/topical";
import { fitDescription } from "@/lib/topic-seo";

/**
 * One exam series of one syllabus ("9706 May/June 2025"): every paper, the mark
 * each grade needed, the examiner report notes and the topics that came up.
 * Every figure is read from the checked data files; nothing here is written by hand.
 */

export interface SeriesGroup {
  num: string;
  title: string | null;
  minutes: number | null;
  marks: number | null;
  mcq: boolean;
  papers: Paper[];
}

export interface SeriesMarkRow {
  paper: Paper;
  t: ComponentThresholds;
  /** The top grade's mark as a share of the paper, 0 to 100. */
  topPct: number;
  /** Change in the top grade's mark against the same paper one year earlier, when both are out of the same total. */
  change: number | null;
}

export interface SeriesData {
  papers: Paper[];
  groups: SeriesGroup[];
  marks: SeriesMarkRow[];
  /** Grade letters shown as columns, highest first. */
  letters: string[];
  /** The top grade ("A"). */
  top: string | null;
  /** Lowest and highest share of the marks the top grade needed. */
  range: { low: SeriesMarkRow; high: SeriesMarkRow } | null;
  /** The same series one year earlier, when the library has it. */
  lastYear: PaperSession | null;
  report: ExaminerReport | null;
  /** Topics with questions in this series, most questions first. */
  topics: Array<{ e: TopicEntry; n: number }>;
  /** "1 and 2" when only some papers of the series are sorted by topic (the A Level papers of 9706 and 9609); null when all are. */
  topicPapers: string | null;
  newer: PaperSession | null;
  older: PaperSession | null;
  /** The same series in the other syllabuses of this level or subject. */
  siblings: Array<{ s: PastPaperSyllabus; href: string }>;
  counts: { qp: number; ms: number; insert: number };
}

const same = (a: PaperSession, b: PaperSession) => a.s === b.s && a.y === b.y;

export function seriesData(s: PastPaperSyllabus, x: PaperSession): SeriesData {
  const all = papersFor(s.code);
  const papers = all.filter((p) => same(p.session, x));
  const groups: SeriesGroup[] = [];
  for (const p of papers) {
    const g = groups.find((o) => o.num === p.num);
    if (g) g.papers.push(p);
    else groups.push({ num: p.num, title: p.title, minutes: p.minutes, marks: p.marks, mcq: p.mcq, papers: [p] });
  }

  const sessions = sessionsFor(s.code);
  const lastYear = sessions.find((o) => o.s === x.s && o.y === x.y - 1) ?? null;
  const before = lastYear ? all.filter((p) => same(p.session, lastYear)) : [];
  const first = papers.map(thresholdsFor).find((t) => t && t.grades.length);
  const top = first?.grades[0][0] ?? null;
  const marks: SeriesMarkRow[] = [];
  for (const paper of papers) {
    const t = thresholdsFor(paper);
    const mine = t?.grades.find(([g]) => g === top);
    if (!t || !mine) continue;
    const old = before.find((o) => o.pv === paper.pv);
    const ot = old ? thresholdsFor(old) : null;
    const theirs = ot?.grades.find(([g]) => g === top);
    marks.push({ paper, t, topPct: Math.round((mine[1] / t.max) * 100), change: ot && theirs && ot.max === t.max ? mine[1] - theirs[1] : null });
  }
  const letters = marks.reduce<string[]>((best, r) => (r.t.grades.length > best.length ? r.t.grades.map(([g]) => g) : best), []);
  const sorted = [...marks].sort((a, b) => a.topPct - b.topPct);
  const range = sorted.length > 1 && sorted[0].topPct !== sorted.at(-1)!.topPct ? { low: sorted[0], high: sorted.at(-1)! } : null;

  const entries = topicalFor(s.code);
  const topics = entries
    .map((e) => ({ e, n: e.questions.filter((q) => q.y === x.y && q.s === x.s).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const sorted2 = [...new Set(entries.flatMap((e) => e.questions.filter((q) => q.y === x.y && q.s === x.s).map((q) => q.num)))].sort();
  const topicPapers = sorted2.length && sorted2.length < groups.length ? (sorted2.length > 1 ? `${sorted2.slice(0, -1).join(", ")} and ${sorted2.at(-1)}` : sorted2[0]) : null;

  const i = sessions.findIndex((o) => same(o, x));
  const siblings = PAST_PAPER_SYLLABI.filter((o) => o.code !== s.code && (o.level === s.level || o.subject === s.subject)).flatMap((o) => {
    const theirs = sessionsFor(o.code).find((y) => same(y, x));
    return theirs && papersFor(o.code).some((p) => same(p.session, theirs)) ? [{ s: o, href: seriesHref(o.slug, theirs) }] : [];
  });

  return {
    papers,
    groups,
    marks,
    letters,
    top,
    range,
    lastYear: marks.some((r) => r.change !== null) ? lastYear : null,
    report: EXAMINER_REPORTS.find((r) => r.code === s.code && r.series === sessionKey(x)) ?? null,
    topics,
    topicPapers,
    newer: sessions[i - 1] ?? null,
    older: sessions[i + 1] ?? null,
    siblings,
    counts: { qp: papers.length, ms: papers.filter((p) => p.ms).length, insert: papers.filter((p) => p.insert).length },
  };
}

/** Every series that gets a page: any series with at least one question paper. */
export function seriesFor(s: PastPaperSyllabus): PaperSession[] {
  const all = papersFor(s.code);
  return sessionsFor(s.code).filter((x) => all.some((p) => same(p.session, x)));
}

/** "9706 May/June 2025 Past Papers and Mark Schemes (s25)", within 60 characters. */
export function seriesTitle(s: PastPaperSyllabus, x: PaperSession): string {
  const base = `${s.code} ${sessionLabel(x)}`;
  const k = sessionKey(x);
  const options = [
    `${base} Past Papers and Mark Schemes (${k})`,
    `${base} Past Papers, Mark Schemes (${k})`,
    `${base} Past Papers and Mark Schemes`,
    `${base} Past Papers`,
  ];
  return options.find((o) => o.length <= 60) ?? options.at(-1)!;
}

/** Opens with the code and series the student typed, then what the page holds: 140 to 158 characters. */
export function seriesDescription(s: PastPaperSyllabus, x: PaperSession): string {
  const d = seriesData(s, x);
  const n = d.papers.length;
  const head = `${s.code} ${sessionLabel(x)} (${sessionKey(x)}): all ${n} ${s.subject === "Business" && s.level !== "AS and A Level" ? "Business Studies" : s.subject} papers with mark schemes`;
  const grade = d.top ? `${d.top} grade marks for each paper` : "";
  const exam = d.report ? "examiner report mistakes" : "";
  const topics = !d.topics.length ? "" : d.topicPapers ? `Paper ${d.topicPapers} questions by topic` : `${d.topics.length} topics tested`;
  const join = (parts: string[]) => {
    const list = parts.filter(Boolean);
    if (!list.length) return "";
    const text = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0];
    return ` ${text[0].toUpperCase()}${text.slice(1)}.`;
  };
  return fitDescription([
    `${head}.${join([grade, exam, topics])} Free to read and print, no ads.`,
    `${head}.${join([grade, exam, topics])} Free, no ads.`,
    `${head}.${join([grade, exam, topics])} Free.`,
    `${head}.${join([grade, topics])} Free, no ads.`,
    `${head}.${join([grade, exam, topics])}`,
    `${head}.${join([grade, topics])}`,
    `${head}.${join([grade])} Free.`,
    `${head}. Free.`,
  ]);
}
