import type { QuestionType } from "@/types";

/** A question extracted from a document, before the teacher edits/saves it. */
export interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  marks: number;
  topic: string;
  options: string[];
  /** -1 when the document gave no answer: the teacher chooses it, it is never a silent "A". */
  correctIndex: number;
  /** Which file it came from — shown in the review table. */
  source?: string;
}

const DEFAULT_TOPIC = "Imported";

/** "1. ", "1) ", "Q1.", "Question 1:" …, with the question on the same line or the next one. */
const QUESTION_START = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-](?:\s+(.*))?$/i;
/**
 * Cambridge prints "1 Which statement…" and "2 (a) Define…" with no dot. Only
 * trusted when it follows on from the last question (see parseQuestions), and
 * never before a month, so "1 January Balance b/d" in a ledger stays text.
 */
const BARE_QUESTION_START = /^(\d{1,2})\s+([A-Z(].*)$/;
const MONTH_WORD = /^\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
/** "A) foo", "a. foo", "(A) foo" */
const OPTION_LINE = /^\s*\(?([A-Ha-h])\)?\s*[.):\-]\s+(.+)$/;
/** Cambridge multiple choice: "A Partners have unlimited liability." (capital letter, no bracket). */
const BARE_OPTION_LINE = /^([A-H])\s+(\S.*)$/;
/**
 * "[3 marks]", "(2 marks)", "4 marks", and the bare "[4]" or "(4)" Cambridge
 * prints at the end of a line. The word must end at "mark" or "marks": "12
 * markets" is not a marks hint (it used to be read as 12 marks and cut out of
 * the question).
 */
const MARKS_HINT = /(?:^|[[(\-\s])(\d{1,2})\s*marks?\b\)?\]?|[[(](\d{1,2})[\])]\s*$/i;
const MARKS_HINT_ALL = new RegExp(MARKS_HINT.source, "gi");
/** "[Total: 10]", "Total 10 marks" */
const TOTAL_HINT = /\[?\s*total\s*:?\s*(\d{1,3})(?:\s*marks?\b)?\s*\]?/i;
/** "Answer: B", "Ans: b", "Correct: B" */
const ANSWER_HINT = /^\s*(?:answer|ans|correct)\s*[:.\-]?\s*\(?([A-Ha-h])\)?\s*$/i;
/** After the options: worked answers and notes are not part of the question. */
const TAIL_START = /^(?:explanation|solution|working|mark scheme)\b\s*[:.\-]/i;
/** Page furniture from Cambridge papers and PDFs, on a line of its own. */
// A lone number of one or two digits is a page number; longer ones ("500") are
// figures in an accounts table and are kept.
const JUNK_LINE = /^(?:\d{1,2}|page \d+(?: of \d+)?|\[?turn over\]?|blank page|©.*|.*\bUCLES\b.*|\d{4}\/\d{2}\/[A-Z]\/[A-Z]\/\d{2})$/i;

const letterToIndex = (letter: string) => letter.toUpperCase().charCodeAt(0) - 65;
const hintValue = (m: RegExpExecArray | RegExpMatchArray) => Number(m[1] ?? m[2]);
const stripHints = (s: string) => s.replace(MARKS_HINT_ALL, "").replace(/\s+[-–]\s*$/, "").replace(/\s{2,}/g, " ").trim();

/**
 * Rebuild line structure from a flat blob.
 *
 * PDF text extraction (and OCR) frequently returns a whole page as one run with
 * no newlines, which would otherwise collapse an entire paper into a single
 * question. We re-break the text before the markers that actually delimit a
 * paper: question numbers, lettered options, and answer keys.
 *
 * A number in the middle of a line only starts a new question when it follows
 * on from the last one (the same number, the next one, or a fresh "1"). That
 * keeps "…sold for $20. The firm…" and "a ratio of 15. Calculate…" inside
 * their question instead of splitting it in two. A number at the start of a
 * line always counts, as before.
 */
function normalizeExtractedText(text: string): string {
  let last: number | null = null;
  return text
    .replace(/\r\n?/g, "\n")
    // "A) foo", "(b) foo", "c. foo"  →  own line, written as it was. Anchored to
    // a word start so "e.g. foo" and mid-word letters are left alone. Whether it
    // really is an option is decided line by line in parseQuestions.
    // Not straight after a Cambridge question number ("2 (a) Define…"), which
    // would leave the number stranded on a line of its own.
    .replace(/(?<!(?:^|\n)[ \t]*\d{1,2})(^|\s)(\(?[A-Ha-h][.)]\s+)/g, "$1\n$2")
    // "Answer: B", "Ans - c"  →  own line
    .replace(/\s*\b((?:Answer|Ans|Correct)\s*[:.\-]?\s*\(?[A-Ha-h]\)?)(?=\s|$)/gi, "\n$1")
    // "1.", "2)", "Q3:", "Question 4."  →  own line (not inside 2024, 1.5, etc.)
    .replace(/(\s*)(?<![\w.])((?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):]\s)/gi, (m: string, ws: string, token: string, num: string, offset: number, whole: string) => {
      const n = Number(num);
      const atLineStart = offset === 0 || ws.includes("\n") || (ws === "" && whole[offset - 1] === "\n");
      if (!atLineStart) {
        // "A) 5. B) 10." : a number straight after an option letter is that option's answer.
        if (/(?:^|[\s(])[A-Ha-h][.)]$/.test(whole.slice(Math.max(0, offset - 3), offset))) return m;
        if (last !== null && n !== last && n !== last + 1 && n !== 1) return m;
      }
      last = n;
      return `\n${token}`;
    });
}

interface Building {
  /** The question as written, marks hints still in it. */
  raw: string;
  hints: number[];
  total: number | null;
  /** Each option with the letter it was written with, for folding back into the prompt. */
  options: Array<{ letter: string; text: string; bare: boolean }>;
  correctIndex: number;
  /** Past "Explanation:" or "Solution:": the rest belongs to the answer, not the question. */
  tail: boolean;
}

/**
 * Turn raw extracted text into draft questions.
 *
 * Deliberately forgiving: documents are messy, and the teacher reviews and edits
 * everything before it is saved. A block with >= 2 lettered options becomes an
 * MCQ; anything else becomes a text question. Text is never dropped quietly:
 * a wrapped option keeps its second line, and lettered parts of a written
 * question ("(a) Define… [2] (b) Explain… [4]") stay in the prompt.
 */
export function parseQuestions(text: string, source?: string): DraftQuestion[] {
  const lines = normalizeExtractedText(text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !JUNK_LINE.test(l));

  const out: DraftQuestion[] = [];
  let current: Building | null = null;

  const addToPrompt = (b: Building, line: string) => {
    for (const m of line.matchAll(MARKS_HINT_ALL)) b.hints.push(hintValue(m));
    b.raw = `${b.raw} ${line}`.trim();
  };

  const flush = () => {
    const b = current;
    current = null;
    if (!b) return;
    const optionHints = b.options.flatMap((o) => Array.from(o.text.matchAll(MARKS_HINT_ALL), hintValue));
    // Lettered parts that carry marks are parts of one written question, and a
    // single "option" is not a multiple choice: both go back into the prompt.
    const written = b.options.length < 2 || optionHints.length > 0;
    let raw = b.raw;
    let hints = b.hints;
    if (written && b.options.length) {
      // A bare letter was most likely just a word ("A firm sold…"): put it back as written.
      raw = `${raw} ${b.options.map((o) => (o.bare ? `${o.letter} ${o.text}` : `(${o.letter}) ${o.text}`)).join(" ")}`.trim();
      // Part marks add up to the question's marks.
      if (optionHints.length) hints = optionHints;
    }
    // One hint is the question's marks (shown beside it, so cut from the text);
    // several are a breakdown by part, which students need to see.
    const prompt = hints.length > 1 ? raw : stripHints(raw);
    if (!prompt) return;
    const sum = hints.reduce((n, x) => n + x, 0);
    out.push({
      type: written ? "text" : "mcq",
      prompt,
      marks: Math.max(1, Math.min(100, b.total ?? (sum || 1))),
      topic: DEFAULT_TOPIC,
      // "A) 5." : the full stop closes the option, it is not part of the number.
      options: written ? [] : b.options.map((o) => o.text.replace(/^([$£€]?[\d.,]+%?)\.$/, "$1")),
      correctIndex: written ? 0 : b.correctIndex,
      source,
    });
  };

  let lastNumber: number | null = null;
  const handle = (line: string, b: Building) => {
    if (b.tail) return;
    if (TAIL_START.test(line)) {
      b.tail = true;
      return;
    }

    // "[Total: 6]" is the whole question's marks, wherever it sits.
    const total = TOTAL_HINT.exec(line);
    if (total) {
      b.total = Number(total[1]);
      line = line.replace(TOTAL_HINT, "").trim();
      if (!line) return;
    }

    const answer = ANSWER_HINT.exec(line);
    if (answer) {
      const idx = letterToIndex(answer[1]);
      if (idx >= 0 && idx < b.options.length) b.correctIndex = idx;
      return;
    }

    // Options come in order (A, then B, …). "…at point B. Which…" in a question
    // is not option B, so a letter out of turn is read as ordinary text. A bare
    // "A Partners…" counts only once the question has some text.
    const option = OPTION_LINE.exec(line);
    if (option && letterToIndex(option[1]) === b.options.length) {
      b.options.push({ letter: option[1], text: option[2].trim(), bare: false });
      return;
    }
    const bare = BARE_OPTION_LINE.exec(line);
    if (bare && b.raw && letterToIndex(bare[1]) === b.options.length && (b.options.length === 0 || b.options.every((o) => o.bare))) {
      b.options.push({ letter: bare[1], text: bare[2].trim(), bare: true });
      return;
    }

    // More of whatever came last: the question, or a long option that ran on.
    const lastOption = b.options[b.options.length - 1];
    if (lastOption) lastOption.text = `${lastOption.text} ${line}`.trim();
    else addToPrompt(b, line);
  };

  for (const line of lines) {
    const start = QUESTION_START.exec(line);
    const bareStart = start || MONTH_WORD.test(line) ? null : BARE_QUESTION_START.exec(line);
    const bareOk = bareStart && (lastNumber === null ? Number(bareStart[1]) === 1 : Number(bareStart[1]) === lastNumber + 1);
    if (start || bareOk) {
      flush();
      const m = (start ?? bareStart)!;
      lastNumber = Number(m[1]);
      current = { raw: "", hints: [], total: null, options: [], correctIndex: -1, tail: false };
      if (m[2]) handle(m[2], current);
      continue;
    }
    if (current) handle(line, current);
  }
  flush();

  return out;
}
