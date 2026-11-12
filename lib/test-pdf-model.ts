/**
 * What goes on a printed test and its marking sheet, worked out from a saved
 * test. Pure: no browser, no PDF library. lib/test-pdf.tsx turns the picture
 * links into images and components/admin/TestPaperDocument.tsx lays it out.
 */
import type { Question, Test } from "@/types";
import { idsInText, isPastPaper, sourceLabel, withoutSources } from "@/lib/paper-builder";

export const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** A picture ready to draw (a data link and its size in pixels), or why it is missing. */
export type PdfImage = { src: string; w: number; h: number } | { failed: true };

export interface PdfQuestion<I = string> {
  /** Its number in this test. */
  n: number;
  marks: number;
  kind: "mcq" | "written";
  /** The wording ("" when the picture is the question). */
  text: string;
  /** Past paper wording: **bold** words and line breaks as printed. */
  rich: boolean;
  /** Typed choices, in the saved order (empty for a picture with A to D). */
  options: string[];
  /** A past paper picture whose choices are printed in it. */
  pictureChoice: boolean;
  /** Pictures of the question (cropped exactly as students see them). */
  images: I[];
  /** Case study or data pages that come with it. */
  inserts: I[];
  /** Its insert was already printed with this earlier question (printed once only). */
  insertWith: number | null;
  /** Ruled answer lines to print (0 when the pictures carry their own space). */
  lines: number;
  /** Too long for lines here: answer on separate paper. */
  separate: boolean;
  /** A past paper's own pages: answer in their spaces, or on separate paper when they have none. */
  ownSpace: boolean;
  /** Marking sheet: the right letter, and its option's words when typed. */
  answer: string | null;
  answerText: string | null;
  /** Marking sheet only: "Q3 · 0452/12 May/June 2024". Never on the student paper. */
  source: string | null;
  /** Marking sheet: mark scheme pages for a written past paper question. */
  scheme: I[];
}

export interface PdfPaper<I = PdfImage> {
  title: string;
  /** "Economics", "O Level / IGCSE", "40 marks", "45 minutes". */
  details: string[];
  totalMarks: number;
  minutes: number | null;
  questions: PdfQuestion<I>[];
  /** Add the multiple choice answer grid as the last page. */
  grid: boolean;
  /** The wordmark as a data link (or a link the renderer can fetch). */
  logo: string;
}

/** Two lines a mark, at least three; past twelve lines' worth of marks, separate paper. */
export function answerLines(marks: number): { lines: number; separate: boolean } {
  const m = Math.max(0, Math.round(marks));
  if (m > 12) return { lines: 0, separate: true };
  return { lines: Math.min(24, Math.max(3, m * 2)), separate: false };
}

/** "price-elasticity-test" */
export const fileSlug = (title: string) => title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80) || "test";

const isInsert = (url: string) => /\/papers\/img\/\d{4}_[msw]\d{2}_in_\d{2}\//.test(url);

/** One saved question as it will be printed (pictures still as links). */
export function describeQuestion(q: Question, n: number): PdfQuestion<string> {
  const past = isPastPaper(q);
  const urls = (q.attachments ?? []).filter(Boolean);
  const source = past ? (idsInText(q.prompt).map(sourceLabel).join(", ") || null) : null;
  const text = past ? withoutSources(q.prompt) : q.prompt.trim();
  const base = { n, marks: Math.max(0, q.marks), text, rich: past, source, scheme: [] as string[], insertWith: null };
  if (q.type === "mcq") {
    const pictureChoice = past && q.options.every((o) => /^[A-D]$/.test(o.trim()));
    // A typed past paper question shows its words, never its picture (as on screen).
    const typedPast = past && !pictureChoice;
    return {
      ...base,
      kind: "mcq",
      options: pictureChoice ? [] : q.options,
      pictureChoice,
      images: typedPast ? [] : urls.filter((u) => !isInsert(u)),
      inserts: typedPast ? [] : urls.filter(isInsert),
      lines: 0,
      separate: false,
      ownSpace: false,
      answer: LETTERS[q.correctIndex] ?? null,
      answerText: pictureChoice ? null : (q.options[q.correctIndex] ?? null),
    };
  }
  // Written: a past paper question's pages carry their own answer space.
  const { lines, separate } = past && urls.length ? { lines: 0, separate: false } : answerLines(q.marks);
  return {
    ...base,
    kind: "written",
    options: [],
    pictureChoice: false,
    images: urls.filter((u) => !isInsert(u)),
    inserts: urls.filter(isInsert),
    lines,
    separate,
    ownSpace: past && urls.length > 0,
    answer: null,
    answerText: null,
  };
}

const LEVEL_LABEL: Record<string, string> = { "IGCSE and O Level": "O Level / IGCSE", AS: "AS Level", A2: "A2 Level" };

/** The test, ready to have its pictures loaded. */
export function describeTest(test: Test, opts: { level?: string | null; grid?: boolean; logo: string }): PdfPaper<string> {
  const questions = [...test.questions].sort((a, b) => a.order - b.order).map((q, i) => describeQuestion(q, i + 1));
  // Two questions on one case study: its pages are printed once, with the first.
  const printed = new Map<string, number>();
  for (const q of questions) {
    const key = q.inserts.join("|");
    if (!key) continue;
    const first = printed.get(key);
    if (first) {
      q.inserts = [];
      q.insertWith = first;
    } else printed.set(key, q.n);
  }
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const minutes = test.durationMinutes > 0 ? test.durationMinutes : null;
  const subject = test.subject && test.subject !== "General" ? test.subject : "";
  const level = opts.level ? (LEVEL_LABEL[opts.level] ?? opts.level) : "";
  const mcqs = questions.filter((q) => q.kind === "mcq").length;
  return {
    title: test.title.trim() || "Test",
    details: [subject, level, `${totalMarks} ${totalMarks === 1 ? "mark" : "marks"}`, minutes ? `${minutes} minutes` : ""].filter(Boolean),
    totalMarks,
    minutes,
    questions,
    grid: opts.grid ?? mcqs >= 10,
    logo: opts.logo,
  };
}

/** Default for the answer grid: on when the test has ten or more multiple choice questions. */
export const gridByDefault = (test: Pick<Test, "questions">) => test.questions.filter((q) => q.type === "mcq").length >= 10;
