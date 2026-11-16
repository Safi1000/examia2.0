/**
 * The target grades a student picked in the welcome flow (profile.targets,
 * one per subject). Shared by Home and Progress so both read them the same way.
 */
import type { Student } from "@/types";
import { GRADE_FLOOR, sameSubject } from "@/lib/performance";
import { isAsStudent } from "@/lib/grading";

type Targets = Record<string, string> | undefined;

/** Their target in one subject, if they picked one. AS Level has no A*: an old A* target counts as A. */
export function targetFor(targets: Targets, student: Student, subject: string): string | undefined {
  const key = Object.keys(targets ?? {}).find((k) => sameSubject(k, subject));
  const t = key ? targets![key] : undefined;
  return typeof t === "string" && t in GRADE_FLOOR ? (t === "A*" && isAsStudent(student.id) ? "A" : t) : undefined;
}

/**
 * One target for their overall grade: only when every subject they take has
 * a target and they are all the same. Otherwise none (each subject's own
 * target shows on Progress).
 */
export function overallTarget(targets: Targets, student: Student, subjects: string[]): string | undefined {
  if (!subjects.length) return undefined;
  const all = subjects.map((s) => targetFor(targets, student, s));
  return all.every((t) => t && t === all[0]) ? all[0] : undefined;
}
