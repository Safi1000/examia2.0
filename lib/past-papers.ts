/**
 * The past paper library: every Cambridge paper, mark scheme, insert, examiner
 * report and grade threshold table from 2022 to 2026 for the nine syllabuses
 * Hamza teaches, hosted on this site.
 *
 * Files are served from /papers/... (a rewrite in next.config.ts to the file
 * storage): PDFs at /papers/pdf/<name>.pdf and each page as an image at
 * /papers/img/<name>/<n>.jpg, so papers show inside the page on any phone.
 *
 * Data:
 * - lib/past-paper-data.json: which files exist for each series.
 * - lib/past-paper-meta.json: read from the PDFs themselves. p = paper title,
 *   minutes and total marks; g = component grade thresholds per series;
 *   k = multiple choice answer keys from the mark schemes; n = page counts.
 */
import raw from "@/lib/past-paper-data.json";
import meta from "@/lib/past-paper-meta.json";
import type { LevelName, SubjectName } from "@/lib/landing";

export interface PaperSession {
  y: number;
  /** m = Feb/March, s = May/June, w = Oct/Nov. */
  s: "m" | "s" | "w";
  gt: boolean;
  er: boolean;
  /** "12" → "imq": insert, mark scheme, question paper. */
  p: Record<string, string>;
}

export interface PastPaperSyllabus {
  code: string;
  slug: string;
  name: string;
  short: string;
  subject: SubjectName;
  level: "O Level" | "IGCSE" | "AS and A Level";
  trialLevel: LevelName;
  /** Code that replaces this one, and from when. */
  next?: { code: string; from: number };
}

export const PAST_PAPER_SYLLABI: PastPaperSyllabus[] = [
  { code: "7707", slug: "o-level-accounting-7707", name: "O Level Accounting 7707", short: "Accounting 7707", subject: "Accounting", level: "O Level", trialLevel: "O Level / IGCSE" },
  { code: "2281", slug: "o-level-economics-2281", name: "O Level Economics 2281", short: "Economics 2281", subject: "Economics", level: "O Level", trialLevel: "O Level / IGCSE" },
  { code: "7115", slug: "o-level-business-studies-7115", name: "O Level Business Studies 7115", short: "Business Studies 7115", subject: "Business", level: "O Level", trialLevel: "O Level / IGCSE", next: { code: "7081", from: 2027 } },
  { code: "0452", slug: "igcse-accounting-0452", name: "IGCSE Accounting 0452", short: "Accounting 0452", subject: "Accounting", level: "IGCSE", trialLevel: "O Level / IGCSE" },
  { code: "0455", slug: "igcse-economics-0455", name: "IGCSE Economics 0455", short: "Economics 0455", subject: "Economics", level: "IGCSE", trialLevel: "O Level / IGCSE" },
  { code: "0450", slug: "igcse-business-studies-0450", name: "IGCSE Business Studies 0450", short: "Business Studies 0450", subject: "Business", level: "IGCSE", trialLevel: "O Level / IGCSE", next: { code: "0264", from: 2027 } },
  { code: "9706", slug: "a-level-accounting-9706", name: "AS and A Level Accounting 9706", short: "Accounting 9706", subject: "Accounting", level: "AS and A Level", trialLevel: "AS Level" },
  { code: "9708", slug: "a-level-economics-9708", name: "AS and A Level Economics 9708", short: "Economics 9708", subject: "Economics", level: "AS and A Level", trialLevel: "AS Level" },
  { code: "9609", slug: "a-level-business-9609", name: "AS and A Level Business 9609", short: "Business 9609", subject: "Business", level: "AS and A Level", trialLevel: "AS Level" },
];

export const PAPER_LEVELS = ["O Level", "IGCSE", "AS and A Level"] as const;

/** "0450 / 0264" where Cambridge has moved the syllabus to a new code, else "0450". */
export const codesLabel = (s: PastPaperSyllabus) => (s.next ? `${s.code} / ${s.next.code}` : s.code);
/** "IGCSE Business Studies 0450 and 0264": the name students search for, old and new code. */
export const searchName = (s: PastPaperSyllabus) => (s.next ? `${s.name} and ${s.next.code}` : s.name);

export const pastPaperSyllabus = (slug: string) => PAST_PAPER_SYLLABI.find((s) => s.slug === slug) ?? null;
export const syllabusByPaperCode = (code: string) => PAST_PAPER_SYLLABI.find((s) => s.code === code) ?? null;
type Meta = {
  p: Record<string, [string | null, number | null, number | null]>;
  g: Record<string, [string[], Record<string, number[]>]>;
  k: Record<string, string>;
  n: Record<string, number>;
  /** Files held back (copies stamped by another site); hidden until clean copies replace them. */
  x: string[];
  /** Multiple choice papers: each question's [page, top, bottom] on the page images (top and bottom as fractions of the page height). */
  q: Record<string, number[][]>;
};
const M = meta as unknown as Meta;
const HELD = new Set(M.x ?? []);

/** Each syllabus's series, without held-back files. Built once so the objects stay the same between calls. */
const LIVE = new Map<string, PaperSession[]>(
  Object.entries(raw as unknown as Record<string, PaperSession[]>).map(([code, list]) => [
    code,
    list
      .map((s) => {
        const tag = `${code}_${s.s}${String(s.y).slice(2)}`;
        const p: Record<string, string> = {};
        for (const [pv, t] of Object.entries(s.p)) {
          const keep = [...t].filter((c) => !HELD.has(`${tag}_${c === "q" ? "qp" : c === "m" ? "ms" : "in"}_${pv}`)).join("");
          if (keep.includes("q")) p[pv] = keep;
        }
        return { ...s, gt: s.gt && !HELD.has(`${tag}_gt`), er: s.er && !HELD.has(`${tag}_er`), p };
      })
      .filter((s) => Object.keys(s.p).length > 0),
  ]),
);
export const sessionsFor = (code: string): PaperSession[] => LIVE.get(code) ?? [];

export const SERIES_NAME: Record<PaperSession["s"], string> = { m: "February/March", s: "May/June", w: "October/November" };
const SERIES_SLUG: Record<PaperSession["s"], string> = { m: "feb-march", s: "may-june", w: "oct-nov" };
/** The letters Cambridge prints on the paper: 2281/12/M/J/25. */
const SERIES_CODE: Record<PaperSession["s"], string> = { m: "F/M", s: "M/J", w: "O/N" };

export const sessionLabel = (s: PaperSession) => `${SERIES_NAME[s.s]} ${s.y}`;
export const sessionKey = (s: PaperSession) => `${s.s}${String(s.y).slice(2)}`;

export type FileType = "qp" | "ms" | "in" | "er" | "gt";
/** "2281_s25_qp_12" */
export const fileName = (code: string, s: PaperSession, type: FileType, pv?: string) => `${code}_${sessionKey(s)}_${type}${pv ? `_${pv}` : ""}`;
export const pdfUrl = (name: string) => `/papers/pdf/${name}.pdf`;
export const pageUrl = (name: string, n: number) => `/papers/img/${name}/${n}.jpg`;
export const pageCount = (name: string) => M.n[name] ?? 0;

/** "12" → "Paper 1, variant 2". */
export const paperLabel = (pv: string) => `Paper ${pv.slice(0, -1)}${pv.length > 1 ? `, variant ${pv.slice(-1)}` : ""}`;

export interface Paper {
  /** "2281_s25_12" */
  key: string;
  code: string;
  pv: string;
  /** Paper number without the variant: "1". */
  num: string;
  session: PaperSession;
  /** URL part: "may-june-2025-paper-12". */
  slug: string;
  /** "Multiple Choice", from the front of the paper. */
  title: string | null;
  minutes: number | null;
  marks: number | null;
  qp: boolean;
  ms: boolean;
  insert: boolean;
  /** Has an answer key, so it can be marked on screen. */
  mcq: boolean;
}

const paperSlug = (s: PaperSession, pv: string) => `${SERIES_SLUG[s.s]}-${s.y}-paper-${pv}`;

function build(code: string, s: PaperSession, pv: string, t: string): Paper {
  const key = `${code}_${sessionKey(s)}_${pv}`;
  const m = M.p[key];
  return {
    key,
    code,
    pv,
    num: pv.slice(0, -1) || pv,
    session: s,
    slug: paperSlug(s, pv),
    title: m?.[0] ?? null,
    minutes: m?.[1] ?? null,
    marks: m?.[2] ?? null,
    qp: t.includes("q"),
    ms: t.includes("m"),
    insert: t.includes("i"),
    mcq: !!M.k[key],
  };
}

/** Every paper with a question paper, newest series first, then by paper and variant. */
export function papersFor(code: string): Paper[] {
  return sessionsFor(code).flatMap((s) =>
    Object.entries(s.p)
      .filter(([, t]) => t.includes("q"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pv, t]) => build(code, s, pv, t)),
  );
}

export const paperBySlug = (code: string, slug: string) => papersFor(code).find((p) => p.slug === slug) ?? null;

/** Total question papers for a syllabus. */
export const paperCount = (code: string) => papersFor(code).length;

/** "2281/12/M/J/25" */
export const cieCode = (p: Paper) => `${p.code}/${p.pv}/${SERIES_CODE[p.session.s]}/${String(p.session.y).slice(2)}`;

/** "Paper 1 Multiple Choice" */
export const paperTitle = (p: Paper) => `Paper ${p.num}${p.title ? ` ${p.title}` : ""}`;

export const paperHref = (slug: string, p: Paper) => `/past-papers/${slug}/${p.slug}`;

/** The papers a syllabus has (1, 2, 3...) with their usual title. */
export function paperNumbers(code: string): Array<{ num: string; title: string | null }> {
  const seen = new Map<string, string | null>();
  for (const p of papersFor(code)) if (!seen.has(p.num) || (!seen.get(p.num) && p.title)) seen.set(p.num, p.title);
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([num, title]) => ({ num, title }));
}

export interface ComponentThresholds {
  max: number;
  /** Highest grade first: [["A", 24], ["B", 20], ...]. */
  grades: Array<[string, number]>;
}

/** Cambridge's minimum raw marks for each grade on this exact paper in this series. */
export function thresholdsFor(p: Paper): ComponentThresholds | null {
  const g = M.g[`${p.code}_${sessionKey(p.session)}`];
  const row = g?.[1][p.pv];
  if (!g || !row) return null;
  const [max, ...mins] = row;
  return { max, grades: g[0].map((letter, i) => [letter, mins[i]] as [string, number]).filter(([, n]) => typeof n === "number" && n >= 0) };
}

/** Grade for a raw mark on one paper, or "U" below the lowest grade. */
export function gradeFor(score: number, t: ComponentThresholds): string {
  for (const [g, min] of t.grades) if (score >= min) return g;
  return "U";
}

/** "BBACD..." from the mark scheme. Only for multiple choice papers. */
export const answerKey = (p: Paper) => M.k[p.key] ?? null;

/** What one paper page needs to show the files. */
export function filesFor(p: Paper) {
  const one = (type: FileType, pv?: string) => {
    const name = fileName(p.code, p.session, type, pv);
    return { name, pdf: pdfUrl(name), pages: pageCount(name) };
  };
  return {
    qp: one("qp", p.pv),
    ms: p.ms ? one("ms", p.pv) : null,
    insert: p.insert ? one("in", p.pv) : null,
    er: p.session.er ? pdfUrl(fileName(p.code, p.session, "er")) : null,
    gt: p.session.gt ? pdfUrl(fileName(p.code, p.session, "gt")) : null,
  };
}

/** One row of the search list: small enough to send every paper to the browser. */
export interface SearchRow {
  /** URL */
  u: string;
  /** "2281/12/M/J/25" */
  c: string;
  /** "O Level Economics · May/June 2025 · Paper 1 Multiple Choice" */
  l: string;
  /** Lower-case words to match. */
  w: string;
}

const LEVEL_WORDS: Record<PastPaperSyllabus["level"], string> = {
  "O Level": "o level olevel ol",
  IGCSE: "igcse gcse",
  "AS and A Level": "a level alevel as level aslevel al",
};
const SUBJECT_WORDS: Record<SubjectName, string> = {
  Accounting: "accounting accounts acc",
  Economics: "economics eco econ",
  Business: "business studies bs bus",
};
const SERIES_WORDS: Record<PaperSession["s"], string> = {
  m: "feb march february fm f/m m",
  s: "may june mj m/j s summer",
  w: "oct nov october november on o/n w winter",
};

export function searchRows(): SearchRow[] {
  return PAST_PAPER_SYLLABI.flatMap((s) =>
    papersFor(s.code).map((p) => ({
      u: paperHref(s.slug, p),
      c: cieCode(p),
      l: `${s.level === "AS and A Level" ? "A Level" : s.level} ${s.subject === "Business" && s.level !== "AS and A Level" ? "Business Studies" : s.subject} · ${sessionLabel(p.session)} · ${paperTitle(p)}${p.pv.length > 1 ? `, variant ${p.pv.slice(-1)}` : ""}`,
      w: [
        s.code,
        `${s.code}/${p.pv}`,
        `${s.code}_${sessionKey(p.session)}`,
        p.pv,
        `p${p.num}`,
        `paper ${p.num}`,
        `v${p.pv.slice(-1)}`,
        String(p.session.y),
        String(p.session.y).slice(2),
        LEVEL_WORDS[s.level],
        SUBJECT_WORDS[s.subject],
        SERIES_WORDS[p.session.s],
        sessionKey(p.session),
        (p.title ?? "").toLowerCase(),
        p.mcq ? "mcq multiple choice" : "",
      ].join(" "),
    })),
  );
}

/** "2022 to 2025": the years on the site right now (changes when new series are added). */
export const YEAR_RANGE = (() => {
  const ys = [...LIVE.values()].flat().map((s) => s.y);
  return `${Math.min(...ys)} to ${Math.max(...ys)}`;
})();

/** One multiple choice question for quick practice, cut from its page image. */
export interface PracticeQuestion {
  /** "2281_s25_12#5" */
  id: string;
  img: string;
  /** Top and bottom of the question on the page, as fractions of the page height. */
  t: number;
  b: number;
  /** Page height ÷ width. */
  r: number;
  a: string;
  /** "2281/12/M/J/25" */
  c: string;
  n: number;
  num: string;
  y: number;
  href: string;
}

/** Every multiple choice question for a syllabus that can be shown on its own (skips questions Cambridge removed). */
export function practiceQuestions(code: string): PracticeQuestion[] {
  const s = syllabusByPaperCode(code);
  if (!s) return [];
  return papersFor(code)
    .filter((p) => p.mcq && M.q?.[p.key])
    .flatMap((p) => {
      const key = M.k[p.key];
      const name = fileName(p.code, p.session, "qp", p.pv);
      return M.q[p.key].flatMap(([page, t, b, r], i) =>
        key[i] && key[i] !== "-" && key[i] !== "*"
          ? [{ id: `${p.key}#${i + 1}`, img: pageUrl(name, page), t, b, r: r ?? 1.414, a: key[i], c: cieCode(p), n: i + 1, num: p.num, y: p.session.y, href: paperHref(s.slug, p) }]
          : [],
      );
    });
}

export const hasPractice = (code: string) => papersFor(code).some((p) => p.mcq && !!M.q?.[p.key]);
