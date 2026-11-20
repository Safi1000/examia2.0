/**
 * Pure grade-letter + auto-grading helpers.
 */
import type { Answer, Submission, Test } from "@/types";
import { awardedMarks, scoreMcq } from "@/lib/scoring";

export type GradeLetter = "A*" | "A" | "B" | "C" | "D" | "E" | "U";

/** Grade bands (Hamza Teaches standard). A 100% result must return A*. */
export function gradeLetter(percent: number): GradeLetter {
  if (percent >= 92) return "A*";
  if (percent >= 85) return "A";
  if (percent >= 75) return "B";
  if (percent >= 65) return "C";
  if (percent >= 60) return "D";
  if (percent >= 50) return "E";
  return "U";
}

// ---- AS Level has no A*: the top AS grade is A (as in the Cambridge exam). ----
const AS_CLASSES = new Set<string>();
const AS_STUDENTS = new Set<string>();
/** Each student's levels per subject (subject id to level ids), for students taking more than one level. */
const LEVELS_BY_SUBJECT = new Map<string, Map<string, string[]>>();
const isAsName = (name: string) => !/\bA2\b/i.test(name) && (/\bAS\b/.test(name) || /\bAS[ -]?level/i.test(name));

/** Called whenever the portal's data changes: which classes are AS, and which students only take AS. */
export function syncAsLevels(classes: Array<{ id: string; name: string }>, students: Array<{ id: string; classIds: string[]; levelSubjects?: Record<string, string[]> }>) {
  AS_CLASSES.clear();
  AS_STUDENTS.clear();
  LEVELS_BY_SUBJECT.clear();
  for (const c of classes) if (isAsName(c.name)) AS_CLASSES.add(c.id);
  for (const s of students) {
    if (s.classIds.length && s.classIds.every((id) => AS_CLASSES.has(id))) AS_STUDENTS.add(s.id);
    if (!s.levelSubjects) continue;
    const bySubject = new Map<string, string[]>();
    for (const [level, subjectIds] of Object.entries(s.levelSubjects)) {
      for (const sj of subjectIds) bySubject.set(sj, [...(bySubject.get(sj) ?? []), level]);
    }
    LEVELS_BY_SUBJECT.set(s.id, bySubject);
  }
}
export const isAsClass = (classId: string | null | undefined) => !!classId && AS_CLASSES.has(classId);
export const isAsStudent = (studentId: string | null | undefined) => !!studentId && AS_STUDENTS.has(studentId);
/**
 * A test set with no level, sat by a student on both AS and A2: AS work when
 * the test's title says AS, or when this student takes its subject at AS only.
 */
export function isAsWork(test: Pick<Test, "classId" | "subjectId" | "title">, studentId: string | null | undefined): boolean {
  if (isAsClass(test.classId) || isAsStudent(studentId)) return true;
  if (test.classId) return false;
  if (isAsName(test.title)) return true;
  const levels = studentId && test.subjectId ? LEVELS_BY_SUBJECT.get(studentId)?.get(test.subjectId) : undefined;
  return !!levels?.length && levels.every((id) => AS_CLASSES.has(id));
}
/** A* becomes A when the work is AS. */
export const capAs = (letter: GradeLetter, as: boolean): GradeLetter => (as && letter === "A*" ? "A" : letter);

export const GRADE_ORDER: GradeLetter[] = ["A*", "A", "B", "C", "D", "E", "U"];

/** Semantic role for a grade, reused by badges and the distribution chart. */
export function gradeRole(letter: GradeLetter): "success" | "warning" | "error" {
  if (letter === "A*" || letter === "A" || letter === "B") return "success";
  if (letter === "C" || letter === "D" || letter === "E") return "warning";
  return "error";
}

/**
 * Auto-grade every MCQ on a submission; text/photo are left untouched for
 * manual scoring. Returns a new answers array (pure).
 */
export function autoGradeMcq(test: Test, answers: Answer[]): Answer[] {
  return answers.map((a) => {
    const q = test.questions.find((x) => x.id === a.questionId);
    if (!q || q.type !== "mcq") return a;
    return { ...a, marksAwarded: scoreMcq(q, a) };
  });
}

/** A test where every question is an MCQ — eligible for bulk release. */
export function isAllMcq(test: Test): boolean {
  return test.questions.length > 0 && test.questions.every((q) => q.type === "mcq");
}

export interface GradeResult {
  awarded: number;
  total: number;
  percent: number;
  letter: GradeLetter;
}

export function gradeSubmission(test: Test, submission: Submission): GradeResult {
  // A written or photo question added after this result went out has no
  // answer at all on the paper: it isn't marks lost until it is marked.
  const counted =
    submission.status === "released"
      ? test.questions.filter((q) => q.type === "mcq" || submission.answers.some((a) => a.questionId === q.id))
      : test.questions;
  const total = counted.reduce((sum, q) => sum + q.marks, 0);
  // Marks are capped at each question's current maximum (it may have been lowered after marking).
  const awarded = awardedMarks(submission, test);
  const pct = total > 0 ? Math.min(100, (awarded / total) * 100) : 0;
  return {
    awarded,
    total,
    percent: Math.round(pct * 10) / 10,
    letter: capAs(gradeLetter(pct), isAsWork(test, submission.studentId)),
  };
}
