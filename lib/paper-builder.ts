/**
 * "From past papers": build a homework or a test for a class in about two
 * minutes, straight from real Cambridge past papers.
 *
 * Pure selection logic and small helpers only. No JSON imports here: the past
 * paper data (lib/past-paper-meta.json and friends) stays on the server, and
 * /api/paper-builder passes it in. The browser imports this file for the
 * labels, the crop links and the source lookups.
 *
 * Where a question came from is written into its prompt (tests) or the
 * homework instructions: "Q3 · 0452/12 May/June 2024". That one line is also
 * how a class's earlier tests and homework are scanned, so a question is never
 * set twice, and how the marking screen finds the mark scheme.
 */
import type { Question } from "@/types";

export type PaperKind = "mcq" | "written";
export type Series = "m" | "s" | "w";

/** The parts of lib/past-paper-meta.json the builder reads. */
export interface MetaLike {
  k: Record<string, string>;
  q: Record<string, number[][]>;
  w: Record<string, Array<[number, number[][]]>>;
  m: Record<string, number>;
  n: Record<string, number>;
  p: Record<string, [string | null, number | null, number | null]>;
  r?: Record<string, number[]>;
  x?: string[];
}
/** lib/past-paper-tags.json: question id → subtopic numbers, main first. */
export type TagsLike = Record<string, string[]>;

/** One past paper question that can be set. */
export interface PoolItem {
  /** "0452_s24_12#3" */
  id: string;
  kind: PaperKind;
  code: string;
  /** Paper and variant: "12". */
  pv: string;
  y: number;
  s: Series;
  /** Question number on the paper. */
  n: number;
  /** Subtopics it tests, main first. */
  subs: string[];
  /** "0452_s24_12" */
  paper: string;
}

/** A question ready to save, as /api/paper-builder sends it. */
export interface BuiltQuestion {
  id: string;
  kind: PaperKind;
  /** "Q3 · 0452/12 May/June 2024": for Hamza only, never shown to a student. */
  label: string;
  /** Subtopic name, used as the question's topic. */
  topic: string;
  sub: string;
  /**
   * Pictures of the question (page images with a #q= crop, see cropUrl): one
   * for multiple choice, the pages (and any insert) for written. Homework
   * always uses these; a test uses them unless the question is typed.
   */
  attachments: string[];
  /**
   * Multiple choice that reads cleanly as text: the stem and the four options,
   * exactly as printed (bold kept as **word**). A test shows this instead of
   * the picture. Absent when the question needs its picture.
   */
  typed?: { stem: string; options: string[] };
  /** Multiple choice: 0 to 3 (A to D). */
  answer?: number;
  /** Written: marks read from the paper, or null when Hamza types them. */
  marks: number | null;
  /** Writing time this question is worth, from the paper's minutes per mark. */
  minutes: number;
  /** This class has been set it before (only used when nothing new was left). */
  seen?: boolean;
}

export interface TopicChoice {
  num: string;
  name: string;
  subs: Array<{ num: string; name: string; mcq: number; written: number }>;
}

// ---------------------------------------------------------------------------
// Which papers a class sits
// ---------------------------------------------------------------------------

export type ClassLevel = "IGCSE and O Level" | "AS" | "A2";
export type PaperSubject = "Accounting" | "Economics" | "Business";

/** Past paper codes for a level and subject, and the syllabus their topics are filed under. */
export interface PaperFamily {
  /** Codes whose papers are used (IGCSE and O Level share the same content). */
  codes: string[];
  /** Syllabus whose topic names are shown (0450 and 7115 are filed under 0264). */
  syllabus: string;
  /** AS classes only see the AS half of an A Level syllabus. */
  asOnly: boolean;
}

const FAMILIES: Record<"O" | "A", Record<PaperSubject, Omit<PaperFamily, "asOnly">>> = {
  O: {
    Accounting: { codes: ["0452", "7707"], syllabus: "0452" },
    Economics: { codes: ["0455", "2281"], syllabus: "0455" },
    Business: { codes: ["0450", "7115"], syllabus: "0264" },
  },
  A: {
    Accounting: { codes: ["9706"], syllabus: "9706" },
    Economics: { codes: ["9708"], syllabus: "9708" },
    Business: { codes: ["9609"], syllabus: "9609" },
  },
};

export function paperFamily(level: ClassLevel, subject: PaperSubject): PaperFamily {
  const f = FAMILIES[level === "IGCSE and O Level" ? "O" : "A"][subject];
  return { ...f, asOnly: level === "AS" };
}

/** The family a question's code belongs to (for Swap). */
export function familyOfCode(code: string): PaperFamily | null {
  for (const side of ["O", "A"] as const)
    for (const f of Object.values(FAMILIES[side])) if (f.codes.includes(code)) return { ...f, asOnly: false };
  return null;
}

export const ALL_CODES = new Set(Object.values(FAMILIES).flatMap((s) => Object.values(s).flatMap((f) => f.codes)));

/** A chapter covers a subtopic when one number sits inside the other ("1.2.1" and "1.2"). */
export const covers = (chapter: string, sub: string) =>
  chapter === sub || chapter.startsWith(`${sub}.`) || sub.startsWith(`${chapter}.`);

// ---------------------------------------------------------------------------
// Labels: "Q3 · 0452/12 May/June 2024"
// ---------------------------------------------------------------------------

const SERIES_NAME: Record<Series, string> = { m: "February/March", s: "May/June", w: "October/November" };
const SERIES_BY_NAME: Record<string, Series> = { "February/March": "m", "May/June": "s", "October/November": "w" };

const ID_RE = /^(\d{4})_([msw])(\d{2})_(\d{2})#(\d{1,3})$/;

export function parseId(id: string): { code: string; s: Series; y: number; pv: string; n: number; paper: string; sess: string } | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const [, code, s, yy, pv, n] = m;
  return { code, s: s as Series, y: 2000 + Number(yy), pv, n: Number(n), paper: `${code}_${s}${yy}_${pv}`, sess: `${s}${yy}` };
}

export function sourceLabel(id: string): string {
  const p = parseId(id);
  if (!p) return id;
  return `Q${p.n} · ${p.code}/${p.pv} ${SERIES_NAME[p.s]} ${p.y}`;
}

const LABEL_RE = /Q(\d{1,3}) · (\d{4})\/(\d{2}) (February\/March|May\/June|October\/November) (\d{4})/g;

/** Every past paper question named in a prompt or an instructions line. */
export function idsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(LABEL_RE)) {
    const [, n, code, pv, series, year] = m;
    out.push(`${code}_${SERIES_BY_NAME[series]}${year.slice(2)}_${pv}#${Number(n)}`);
  }
  return out;
}

/**
 * A prompt without its source line, for students (they never see where a
 * question came from). Empty when the prompt was only the source.
 */
export function withoutSources(text: string): string {
  return text.replace(LABEL_RE, "").replace(/^[\s·.,;:]+|[\s·,;:]+$/g, "").trim();
}

/** Homework instructions without the sources line, for students. */
export function withoutSourcesLine(instructions: string): string {
  return instructions
    .split("\n")
    .filter((l) => !l.startsWith(SOURCES_PREFIX))
    .join("\n")
    .trim();
}

/** The homework instructions line that lists the questions' sources. */
export const SOURCES_PREFIX = "Past paper questions:";
export function sourcesLine(ids: string[]): string {
  return `${SOURCES_PREFIX} ${ids.map(sourceLabel).join("; ")}.`;
}
/** Replaces (or adds) the sources line, keeping anything else Hamza wrote. */
export function withSourcesLine(instructions: string, ids: string[]): string {
  const rest = instructions
    .split("\n")
    .filter((l) => !l.startsWith(SOURCES_PREFIX))
    .join("\n")
    .trim();
  const line = ids.length ? sourcesLine(ids) : "";
  return [line, rest].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Cropped page images: /papers/img/<name>/<page>.jpg#q=<t>,<b>,<l>,<r>,<ratio>[,<cover x,y,w,h>]
// ---------------------------------------------------------------------------

/**
 * A crop rides on the page image's URL as a fragment, so nothing new is stored.
 * All values are fractions of the page: top, bottom, left and right edges,
 * then the page's height ÷ width. An optional box covers the paper's printed
 * question number with paper white when the picture can't simply start to its
 * right (the student is on "Question 3", not "17").
 *
 * Older links use #crop=<top>,<bottom>,<ratio> with the page's side margins
 * trimmed; they still work, and the viewer asks the server for the newer crop.
 */
export interface CropBox {
  t: number;
  b: number;
  l: number;
  r: number;
  ratio: number;
  cover?: [number, number, number, number] | null;
}
export interface Crop extends CropBox {
  src: string;
  /** An older #crop= link (built before the crops were measured again). */
  legacy: boolean;
}

const f4 = (v: number) => +v.toFixed(4);

export function cropUrl(img: string, c: CropBox): string {
  const parts = [c.t, c.b, c.l, c.r, c.ratio, ...(c.cover ?? [])].map(f4);
  return `${img}#q=${parts.join(",")}`;
}

/** The older form's side margins (the viewer used to trim 7.5% each side). */
const OLD_MARGIN = 0.075;

export function parseCrop(url: string): Crop | null {
  const q = url.indexOf("#q=");
  if (q >= 0) {
    const v = url.slice(q + 3).split(",").map(Number);
    const [t, b, l, r, ratio, cx, cy, cw, ch] = v;
    if (![t, b, l, r, ratio].every(Number.isFinite)) return null;
    if (!(t >= 0 && b > t && b <= 1 && l >= 0 && r > l && r <= 1 && ratio > 0.2 && ratio < 5)) return null;
    const cover = v.length >= 9 && [cx, cy, cw, ch].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ? ([cx, cy, cw, ch] as [number, number, number, number]) : null;
    return { src: url.slice(0, q), t, b, l, r, ratio, cover, legacy: false };
  }
  const i = url.indexOf("#crop=");
  if (i < 0) return null;
  const [t, b, ratio] = url.slice(i + 6).split(",").map(Number);
  if (![t, b, ratio].every((v) => Number.isFinite(v)) || !(t >= 0 && b > t && b <= 1 && ratio > 0.2 && ratio < 5)) return null;
  return { src: url.slice(0, i), t, b, l: OLD_MARGIN, r: 1 - OLD_MARGIN, ratio, cover: null, legacy: true };
}

/** A past paper page image this site serves (cropped or not), so older links can be brought up to date. */
export const isPaperImage = (url: string) => /^\/papers\/img\/\d{4}_[msw]\d{2}_(qp|in)_\d{2}\/\d{1,3}\.jpg(#|$)/.test(url);

// ---------------------------------------------------------------------------
// The pool
// ---------------------------------------------------------------------------

const KEY_RE = /^(\d{4})_([msw])(\d{2})_(\d{2})$/;

/**
 * lib/past-paper-mcq.json (made by scripts/build-mcq-data.mjs from the papers
 * themselves): per multiple choice question either [0, reason] (left out) or
 * [page, top, bottom, left, right, form, cover, stem?, options?] with form 1 =
 * typed, 2 = picture; per written question the box over its printed number;
 * per insert the pages worth showing (not the cover, which names the paper).
 */
export type McqEntry = [number, number, number, number, number, 1 | 2, [number, number, number, number] | null, string?, string[]?] | [0, string];
export interface McqDataLike {
  q: Record<string, McqEntry[]>;
  w: Record<string, [number, number, number, number]>;
  i: Record<string, number[]>;
}
export const mcqUsable = (e: McqEntry | undefined): e is Exclude<McqEntry, [0, string]> => !!e && e[0] !== 0;

/**
 * Every question that can be set for these codes: tagged with a subtopic, with
 * measured crops on the page images, never from a held back file (meta.x),
 * never a question Cambridge removed ("-" or "*" in the key), never one the
 * measuring left out (its options aren't all on its page, it shares wording or
 * a diagram with another question, or its printed number couldn't be found).
 */
export function buildPool(meta: MetaLike, tags: TagsLike, codes: string[], data?: McqDataLike): PoolItem[] {
  const held = new Set(meta.x ?? []);
  const want = new Set(codes);
  const keys = new Set([...Object.keys(meta.q ?? {}), ...Object.keys(meta.w ?? {})]);
  const out: PoolItem[] = [];
  for (const key of [...keys].sort()) {
    const m = KEY_RE.exec(key);
    if (!m || !want.has(m[1])) continue;
    const [, code, s, yy, pv] = m;
    const qp = `${code}_${s}${yy}_qp_${pv}`;
    if (held.has(qp) || !meta.n[qp]) continue;
    const base = { code, pv, y: 2000 + Number(yy), s: s as Series, paper: key };
    const answers = meta.k[key];
    const mcq = meta.q?.[key];
    if (answers && mcq) {
      mcq.forEach((_, i) => {
        const id = `${key}#${i + 1}`;
        const subs = tags[id];
        if (!subs?.length || !"ABCD".includes(answers[i] ?? "-") || !answers[i]) return;
        if (data && !mcqUsable(data.q[key]?.[i])) return;
        out.push({ ...base, id, kind: "mcq", n: i + 1, subs: subs.slice(0, 1) });
      });
    }
    const written = meta.w?.[key];
    if (written?.length) {
      // A paper whose insert is held back can't be set: the questions need it.
      if (held.has(`${code}_${s}${yy}_in_${pv}`)) continue;
      for (const [n] of written) {
        const id = `${key}#${n}`;
        const subs = tags[id];
        if (!subs?.length) continue;
        // Its printed number must be found, so it can be covered.
        if (data && !data.w[id]) continue;
        out.push({ ...base, id, kind: "written", n, subs: subs.slice(0, 2) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------

/** A small seeded random number generator, so a build can be repeated in checks. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const subOrder = (a: string, b: string) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  return 0;
};

/** The first chosen subtopic a question tests, or null when it tests none of them. */
const matchSub = (item: PoolItem, subs: string[]) => item.subs.find((s) => subs.some((c) => covers(c, s))) ?? null;

export interface PickOptions {
  /** Subtopic numbers ("1.2"). */
  subs: string[];
  mcq: number;
  written: number;
  /** Question ids that must not be picked (already in this test). */
  exclude?: Iterable<string>;
  /** Question ids this class has been set before: picked only when nothing new is left. */
  seen?: Iterable<string>;
  seed?: number;
}

/**
 * Picks questions spread across the chosen topics (taking turns topic by
 * topic) and across sessions (a paper already used is passed over while
 * another one has a question; newer sessions come first, with a little
 * shuffle so two builds differ). Never a question in `exclude`, never the
 * same question twice; one the class has had before (`seen`) only when its
 * topic has nothing new left. Multiple choice first, then written, each in
 * syllabus order.
 */
export function pickQuestions(pool: PoolItem[], opts: PickOptions): PoolItem[] {
  const rand = rng(opts.seed ?? 1);
  const used = new Set(opts.exclude ?? []);
  const seen = new Set(opts.seen ?? []);
  const paperUse = new Map<string, number>();
  // Papers this class has already had questions from count as used, so new picks come from other sessions.
  for (const id of new Set([...used, ...seen])) {
    const paper = parseId(id)?.paper;
    if (paper) paperUse.set(paper, (paperUse.get(paper) ?? 0) + 1);
  }
  const newest = pool.reduce((y, q) => Math.max(y, q.y), 0);
  const out: PoolItem[] = [];

  for (const [kind, count] of [["mcq", opts.mcq], ["written", opts.written]] as const) {
    if (count <= 0) continue;
    const groups = new Map<string, PoolItem[]>();
    for (const q of pool) {
      if (q.kind !== kind || used.has(q.id)) continue;
      const sub = matchSub(q, opts.subs);
      if (sub) groups.set(sub, [...(groups.get(sub) ?? []), q]);
    }
    // Each topic's questions in a fixed random order (for the tie breaks).
    const jitter = new Map<string, number>();
    for (const list of groups.values()) for (const q of list) jitter.set(q.id, rand());
    const order = [...groups.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const score = (q: PoolItem) => (seen.has(q.id) ? 10_000 : 0) + (paperUse.get(q.paper) ?? 0) * 10 + (newest - q.y) * 0.8 + jitter.get(q.id)! * 2.4;
    let taken = 0;
    while (taken < count) {
      let progressed = false;
      for (const sub of order) {
        if (taken >= count) break;
        const list = groups.get(sub)!.filter((q) => !used.has(q.id));
        if (!list.length) continue;
        const best = list.reduce((a, q) => (score(q) < score(a) ? q : a));
        used.add(best.id);
        paperUse.set(best.paper, (paperUse.get(best.paper) ?? 0) + 1);
        out.push(best);
        taken++;
        progressed = true;
      }
      if (!progressed) break;
    }
  }
  const rank = (q: PoolItem) => matchSub(q, opts.subs) ?? q.subs[0];
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "mcq" ? -1 : 1) || subOrder(rank(a), rank(b)) || b.y - a.y || a.n - b.n);
}

/**
 * Swap: another question of the same kind on the same main topic, not used
 * yet (falls back to its second topic). Null when that topic has run out.
 */
export function swapFor(pool: PoolItem[], id: string, exclude: Iterable<string>, seed = 1, seen: Iterable<string> = []): PoolItem | null {
  const was = pool.find((q) => q.id === id);
  const p = parseId(id);
  const kind = was?.kind ?? null;
  const subs = was?.subs ?? [];
  if (!kind || !subs.length || !p) return null;
  const used = new Set(exclude);
  used.add(id);
  for (const sub of subs) {
    const picked = pickQuestions(
      pool.filter((q) => q.kind === kind && q.subs.includes(sub)),
      { subs: [sub], mcq: kind === "mcq" ? 1 : 0, written: kind === "written" ? 1 : 0, exclude: used, seen, seed },
    );
    if (picked.length) return picked[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Timing and defaults
// ---------------------------------------------------------------------------

/** Writing time for a set of questions: their minutes added up, rounded up to 5, at least 10. */
export function testMinutes(qs: Array<Pick<BuiltQuestion, "minutes">>): number {
  const total = qs.reduce((n, q) => n + q.minutes, 0);
  return Math.max(10, Math.ceil(total / 5) * 5);
}

/** Starting mix: a test leans on auto marked multiple choice; homework on written work. */
export function defaultMix(mode: "test" | "homework", hasMcq: boolean): { mcq: number; written: number } {
  if (!hasMcq) return { mcq: 0, written: mode === "test" ? 2 : 3 };
  return mode === "test" ? { mcq: 10, written: 1 } : { mcq: 5, written: 2 };
}

/**
 * A built question as a test question. Multiple choice is auto marked: typed
 * (stem as the prompt, the four options as text) when it reads cleanly,
 * otherwise its one picture with the letters A to D. Written is a photo answer.
 * The source label stays at the end of the prompt for Hamza (history, mark
 * scheme, Swap); every student screen strips it.
 */
export function questionFromBuilt(q: BuiltQuestion): Omit<Question, "id" | "order"> {
  const common = { topic: q.topic };
  const out: Omit<Question, "id" | "order" | "options" | "correctIndex"> & { options?: string[]; correctIndex?: number } =
    q.kind === "mcq"
      ? q.typed
        ? { ...common, prompt: `${q.typed.stem}\n\n${q.label}`, attachments: [], type: "mcq", marks: 1, options: q.typed.options, correctIndex: q.answer ?? 0 }
        : { ...common, prompt: q.label, attachments: q.attachments, type: "mcq", marks: 1, options: ["A", "B", "C", "D"], correctIndex: q.answer ?? 0 }
      : { ...common, prompt: q.label, attachments: q.attachments, type: "photo", marks: q.marks ?? 0 };
  return out as Omit<Question, "id" | "order">;
}

/** A past paper question (its prompt names its source). */
export const isPastPaper = (q: { prompt: string }) => idsInText(q.prompt).length > 0;

/** A fresh seed for a build or a swap, so two builds differ. */
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
