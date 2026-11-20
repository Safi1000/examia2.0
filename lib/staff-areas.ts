/**
 * The parts of the console Hamza can switch on for each staff member, in
 * Settings. Shared by the screens and the server (no browser-only code here).
 * Never on the list, so never theirs: Today (it shows who has gone quiet),
 * student activity, Groundwork, cohorts, export and settings.
 */
export const STAFF_AREAS = [
  { key: "marking", label: "Mark tests and release results", pages: ["/admin/submissions", "/admin/grading"] },
  { key: "homework", label: "Reply to homework", pages: ["/admin/assignments"] },
  { key: "students", label: "Look up students", hint: "Names, marks and attendance. No phone numbers, no changes.", pages: ["/admin/roster"] },
  { key: "notes", label: "Read notes", hint: "Read only. No uploading, hiding or deleting.", pages: ["/admin/notes"] },
  { key: "tests", label: "Tests", hint: "See, set, edit, close and release tests. No deleting, no messaging students.", pages: ["/admin/tests"] },
  { key: "bank", label: "Question bank", pages: ["/admin/bank"] },
  { key: "attendance", label: "Attendance", pages: ["/admin/attendance"] },
  // Not the Recordings page: it shows who opened each recording.
  { key: "classes", label: "Classes", hint: "Change class times and links. Not the recordings page.", pages: ["/admin/classes"] },
  { key: "whiteboard", label: "Whiteboard", pages: ["/admin/whiteboard"] },
  { key: "announcements", label: "Announcements", pages: ["/admin/announcements"] },
  { key: "analytics", label: "Analytics", hint: "Marks and grades only.", pages: ["/admin/analytics"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; hint?: string; pages: readonly string[] }>;

export type StaffArea = (typeof STAFF_AREAS)[number]["key"];
const KEYS = new Set<string>(STAFF_AREAS.map((a) => a.key));

/** What a new staff member starts with (and anyone made before the switches existed). */
export const DEFAULT_ACCESS: StaffArea[] = ["marking", "homework", "students", "notes"];

/** A clean list from whatever was stored: known parts only, no repeats. Nothing stored means the starting set. */
export function cleanAccess(v: unknown): StaffArea[] {
  if (!Array.isArray(v)) return [...DEFAULT_ACCESS];
  return STAFF_AREAS.map((a) => a.key).filter((k) => v.includes(k));
}
export const staffAllowed = (v: unknown): StaffArea[] => (Array.isArray(v) ? cleanAccess(v) : [...DEFAULT_ACCESS]);
export const isStaffArea = (k: unknown): k is StaffArea => typeof k === "string" && KEYS.has(k);
