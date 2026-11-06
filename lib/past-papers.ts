/**
 * The past paper finder: every Cambridge paper, mark scheme, insert, examiner
 * report and grade threshold table from 2022 to 2026 for the nine syllabuses
 * Hamza teaches. The site doesn't host the PDFs (Cambridge owns them): each
 * link opens the file on PapaCambridge, a free public archive.
 * Data: lib/past-paper-data.json (made from the list of files that exist).
 */
import raw from "@/lib/past-paper-data.json";
import type { LevelName, SubjectName } from "@/lib/landing";

const FILES = "https://pastpapers.papacambridge.com/directories/CAIE/CAIE-pastpapers/upload/";

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

export const pastPaperSyllabus = (slug: string) => PAST_PAPER_SYLLABI.find((s) => s.slug === slug) ?? null;
export const sessionsFor = (code: string): PaperSession[] => ((raw as unknown as Record<string, PaperSession[]>)[code] ?? []);

export const SERIES_NAME: Record<PaperSession["s"], string> = { m: "February/March", s: "May/June", w: "October/November" };
export const sessionLabel = (s: PaperSession) => `${SERIES_NAME[s.s]} ${s.y}`;
const tag = (s: PaperSession) => `${s.s}${String(s.y).slice(2)}`;

export const fileUrl = (code: string, s: PaperSession, type: "qp" | "ms" | "in" | "er" | "gt", pv?: string) =>
  `${FILES}${code}_${tag(s)}_${type}${pv ? `_${pv}` : ""}.pdf`;

/** "12" → "Paper 1, variant 2". */
export const paperLabel = (pv: string) => `Paper ${pv.slice(0, -1)}${pv.length > 1 ? `, variant ${pv.slice(-1)}` : ""}`;

/** Total papers listed for a syllabus (question papers). */
export const paperCount = (code: string) => sessionsFor(code).reduce((n, s) => n + Object.values(s.p).filter((t) => t.includes("q")).length, 0);
