/**
 * Each student's own exam papers and dates.
 *
 * The dates are Cambridge's, copied from the Final Exam Timetable for June 2027,
 * administrative zone 4 (the syllabus view, pages 10 to 13), downloaded from
 * cambridgeinternational.org on 17 Nov 2026:
 * https://www.cambridgeinternational.org/Images/766282-june-2027-zone-4-timetable.pdf
 * Zone 4 sits the "2" papers (12, 22, 32, 42), which is what candidates in
 * Pakistan sit. Cambridge can revise a final timetable: check that page again
 * before the exams and update the table below if a date moved.
 *
 * O Level and IGCSE share every date here (7707 and 0452, 7081 and 0264, 2281
 * and 0455 are sat on the same days), so the portal's single "IGCSE / O Level"
 * class needs no extra question. AS students sit Papers 1 and 2; A2 students
 * sit Papers 3 and 4.
 *
 * Pure, so the server and the browser agree. Nothing is stored.
 */
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { subjectsAtLevel } from "@/lib/levels";
import { levelOf, subjectOf, pkDate, type LevelKey, type SubjectKey } from "@/lib/timetable";

export const EXAM_SERIES = {
  name: "May/June 2027",
  source: "Cambridge May/June 2027 timetable, zone 4",
  checked: "2026-11-17",
};

export interface ExamPaper {
  level: LevelKey;
  subject: SubjectKey;
  /** Paper number as students say it: Paper 1, Paper 2… */
  paper: 1 | 2 | 3 | 4;
  /** Multiple choice papers are named, since students revise for them differently. */
  multipleChoice?: boolean;
  /** Component codes as printed on the timetable. */
  codes: string;
  /** YYYY-MM-DD. */
  date: string;
  minutes: number;
}

const P = (level: LevelKey, subject: SubjectKey, paper: 1 | 2 | 3 | 4, codes: string, date: string, minutes: number, multipleChoice = false): ExamPaper => ({
  level,
  subject,
  paper,
  codes,
  date,
  minutes,
  ...(multipleChoice ? { multipleChoice } : {}),
});

/** Every paper for the classes Hamza teaches, in date order. */
export const EXAM_PAPERS: ExamPaper[] = [
  // AS Level (9706, 9609, 9708)
  P("AS", "Business", 1, "9609/12", "2027-05-04", 75),
  P("AS", "Economics", 2, "9708/22", "2027-05-05", 120),
  P("AS", "Accounting", 2, "9706/22", "2027-05-10", 105),
  P("AS", "Business", 2, "9609/22", "2027-05-12", 90),
  P("AS", "Accounting", 1, "9706/12", "2027-06-03", 60, true),
  P("AS", "Economics", 1, "9708/12", "2027-06-07", 60, true),
  // A2 (the A Level papers of 9706, 9609, 9708)
  P("A2", "Business", 3, "9609/32", "2027-05-13", 105),
  P("A2", "Accounting", 3, "9706/32", "2027-05-18", 90),
  P("A2", "Business", 4, "9609/42", "2027-05-20", 75),
  P("A2", "Economics", 4, "9708/42", "2027-05-24", 120),
  P("A2", "Accounting", 4, "9706/42", "2027-05-25", 60),
  P("A2", "Economics", 3, "9708/32", "2027-06-11", 75, true),
  // O Level and IGCSE (same dates for both)
  P("O", "Business", 1, "7081/12 · 0264/12", "2027-05-12", 90),
  P("O", "Accounting", 2, "7707/22 · 0452/22", "2027-05-19", 105),
  P("O", "Business", 2, "7081/22 · 0264/22", "2027-05-21", 90),
  P("O", "Economics", 2, "2281/22 · 0455/22", "2027-05-26", 120),
  P("O", "Accounting", 1, "7707/12 · 0452/12", "2027-06-03", 90, true),
  P("O", "Economics", 1, "2281/12 · 0455/12", "2027-06-11", 60, true),
].sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));

/** Whole days from today (Pakistan) to a date; 0 on the day, negative once it has passed. */
export function daysUntil(date: string, nowMs: number): number {
  const today = pkDate(nowMs);
  return Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86_400_000);
}

/** "Tue 4 May" (the year is added only when it is not this year). */
export function examDateLabel(date: string, nowMs: number, long = false): string {
  const d = new Date(`${date}T12:00:00+05:00`);
  const sameYear = date.slice(0, 4) === pkDate(nowMs).slice(0, 4);
  return d.toLocaleDateString("en-GB", {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "Asia/Karachi",
  });
}

export const paperName = (p: Pick<ExamPaper, "subject" | "paper">) => `${p.subject} Paper ${p.paper}`;

/**
 * The papers this student sits, in date order: their own levels and the
 * subjects they take at each (the same fallbacks as the timetable: the
 * cohort's when the student has none set, every subject after that).
 * Empty when their class is not one of the three taught levels.
 */
export function examsForStudent(db: Pick<Database, "classes" | "subjects" | "cohorts">, student: Student): ExamPaper[] {
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const classIds = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
  const out: ExamPaper[] = [];
  for (const classId of classIds) {
    const cls = db.classes.find((c) => c.id === classId);
    const level = cls ? levelOf(cls) : null;
    if (!level) continue;
    const subjectIds = subjectsAtLevel(student, classId, cohort?.subjectIds);
    const subjects = new Set(
      subjectIds.map((id) => db.subjects.find((s) => s.id === id)).map((s) => (s ? subjectOf(s) : null)).filter((s): s is SubjectKey => !!s),
    );
    for (const p of EXAM_PAPERS) {
      if (p.level !== level) continue;
      if (subjects.size && !subjects.has(p.subject)) continue;
      if (!out.includes(p)) out.push(p);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));
}

/** The next paper still to come (today counts), or null when all are done or none are known. */
export function nextExam(papers: ExamPaper[], nowMs: number): ExamPaper | null {
  return papers.find((p) => daysUntil(p.date, nowMs) >= 0) ?? null;
}
