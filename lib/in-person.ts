/**
 * In-person (physical) students. They sit in the normal groups next to online
 * students and use the portal for classes, recordings and tests, but Hamza
 * manages the rest himself: no phone numbers stored, no class register or
 * automatic absences, no monthly report and no parent messages.
 *
 * The tag is a "student_in_person" row in the activities table, addressed to
 * Hamza only (students can't read it), so it needs no database change. One row
 * per tagged student; removing the row removes the tag.
 */
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";

export const IN_PERSON = "In person";
export const IN_PERSON_TYPE = "student_in_person" as const;

/** Every tagged student's id. */
export function inPersonIds(db: Pick<Database, "activities">): Set<string> {
  return new Set(db.activities.filter((a) => a.type === IN_PERSON_TYPE && a.studentId).map((a) => a.studentId!));
}

export const isInPersonStudent = (db: Pick<Database, "activities">, s: Pick<Student, "id"> | null | undefined) =>
  !!s && db.activities.some((a) => a.type === IN_PERSON_TYPE && a.studentId === s.id);
