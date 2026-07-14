import type { QuestionType } from "@/types";

/** A question extracted from a document, before the teacher edits/saves it. */
export interface DraftQuestion {
  type: QuestionType;
  prompt: string;
  marks: number;
  topic: string;
  options: string[];
  correctIndex: number;
  /** Which file it came from — shown in the review table. */
  source?: string;
}

const DEFAULT_TOPIC = "Imported";

/** "1. ", "1) ", "Q1.", "Question 1:" … */
const QUESTION_START = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]\s+(.*)$/i;
/** "A) foo", "a. foo", "(A) foo", "- foo" */
const OPTION_LINE = /^\s*\(?([A-Ha-h])\)?\s*[.):\-]\s+(.+)$/;
/** "[3 marks]", "(2 marks)", "- 4 marks" */
const MARKS_HINT = /[[(\-\s](\d{1,2})\s*marks?\)?\]?/i;
/** "Answer: B", "Ans: b", "Correct: B" */
const ANSWER_HINT = /^\s*(?:answer|ans|correct)\s*[:.\-]?\s*\(?([A-Ha-h])\)?\s*$/i;

const letterToIndex = (letter: string) => letter.toUpperCase().charCodeAt(0) - 65;

/**
 * Rebuild line structure from a flat blob.
 *
 * PDF text extraction (and OCR) frequently returns a whole page as one run with
 * no newlines, which would otherwise collapse an entire paper into a single
 * question. We re-break the text before the markers that actually delimit a
 * paper: question numbers, lettered options, and answer keys. Over-splitting is
 * harmless here — the teacher reviews and edits every row before saving.
 */
function normalizeExtractedText(text: string): string {
  return text
    // "A) foo", "(b) foo", "c. foo"  →  own line. Anchored to a word start so
    // "e.g. foo" (the '.' before 'g') and mid-sentence letters are left alone.
    .replace(/(?:^|\s)\(?([A-Ha-h])[.)]\s+/g, "\n$1) ")
    // "Answer: B", "Ans - c"  →  own line
    .replace(/\s*\b((?:Answer|Ans|Correct)\s*[:.\-]?\s*\(?[A-Ha-h]\)?)(?=\s|$)/gi, "\n$1")
    // "1.", "2)", "Q3:", "Question 4."  →  own line (not inside 2024, 1.5, etc.)
    .replace(/\s*(?<![\w.])((?:Q(?:uestion)?\s*)?\d{1,3}\s*[.):]\s)/gi, "\n$1");
}

/**
 * Turn raw extracted text into draft questions.
 *
 * Deliberately forgiving: documents are messy, and the teacher reviews and edits
 * everything before it is saved. A block with >= 2 lettered options becomes an
 * MCQ; anything else becomes a text question so nothing is silently dropped.
 */
export function parseQuestions(text: string, source?: string): DraftQuestion[] {
  const lines = normalizeExtractedText(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: DraftQuestion[] = [];
  let current: DraftQuestion | null = null;

  const flush = () => {
    if (!current) return;
    const prompt = current.prompt.trim();
    if (prompt) {
      // Fewer than two options is not a real multiple choice.
      if (current.options.length < 2) {
        current.type = "text";
        current.options = [];
        current.correctIndex = 0;
      }
      out.push({ ...current, prompt });
    }
    current = null;
  };

  for (const line of lines) {
    const start = QUESTION_START.exec(line);
    if (start) {
      flush();
      const body = start[2];
      const marks = MARKS_HINT.exec(body);
      current = {
        type: "text",
        prompt: body.replace(MARKS_HINT, "").trim(),
        marks: marks ? Number(marks[1]) : 1,
        topic: DEFAULT_TOPIC,
        options: [],
        correctIndex: 0,
        source,
      };
      continue;
    }
    if (!current) continue;

    const answer = ANSWER_HINT.exec(line);
    if (answer) {
      const idx = letterToIndex(answer[1]);
      if (idx >= 0 && idx < current.options.length) current.correctIndex = idx;
      continue;
    }

    const option = OPTION_LINE.exec(line);
    if (option) {
      current.type = "mcq";
      current.options.push(option[2].trim());
      continue;
    }

    // Continuation of the prompt.
    const marks = MARKS_HINT.exec(line);
    if (marks && !current.options.length) current.marks = Number(marks[1]);
    if (!current.options.length) {
      current.prompt = `${current.prompt} ${line.replace(MARKS_HINT, "")}`.trim();
    }
  }
  flush();

  return out;
}
