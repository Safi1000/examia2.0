import type { Student } from "@/types";

/**
 * A student can sit more than one level (AS and A2 together) with different
 * subjects at each. Those choices are kept on the student's sign-in account
 * (app_metadata.levels: level id to subject ids), so no database change was
 * needed; the student's level and subject lists still hold everything they take.
 */
export type LevelSubjects = Record<string, string[]>;

/** The subjects a student takes at one level: their choice for that level, else all of theirs, else the cohort's. */
export function subjectsAtLevel(student: Pick<Student, "subjectIds" | "levelSubjects">, classId: string, cohortSubjectIds: string[] = []): string[] {
  const own = student.levelSubjects?.[classId];
  if (own?.length) return own;
  return student.subjectIds.length ? student.subjectIds : cohortSubjectIds;
}

/** Does a level + subject (either may be "any") reach this student? */
export function takesLevelSubject(student: Pick<Student, "classIds" | "subjectIds" | "levelSubjects">, classId: string | null, subjectId: string | null): boolean {
  if (classId && !student.classIds.includes(classId)) return false;
  if (!subjectId) return true;
  if (classId) return subjectsAtLevel(student, classId).includes(subjectId);
  return student.subjectIds.includes(subjectId);
}

/** Only real ids, no empty levels, nothing else on the account touched. */
export function cleanLevels(v: unknown): LevelSubjects {
  const out: LevelSubjects = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, ids] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[0-9a-f-]{36}$/i.test(k) || !Array.isArray(ids)) continue;
    const clean = ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
    if (clean.length) out[k] = [...new Set(clean)].slice(0, 10);
  }
  return out;
}
