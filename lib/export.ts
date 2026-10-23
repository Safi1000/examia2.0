/**
 * Export helpers (pure). The data seam owns the data; these just shape it.
 */
import type { Database } from "@/lib/data/seed";
import { awardedMarks } from "@/lib/scoring";
import { gradeSubmission } from "@/lib/grading";
import { archivedCohortIds } from "@/lib/data/selectors";

export type EntityKey =
  | "cohorts"
  | "students"
  | "tests"
  | "submissions"
  | "announcements"
  | "bank";

export const ENTITY_LABEL: Record<EntityKey, string> = {
  cohorts: "Cohorts",
  students: "Students",
  tests: "Tests",
  submissions: "Submissions",
  announcements: "Announcements",
  bank: "Question bank",
};

/** Entities that make sense as flat CSV tables. */
export const TABULAR: EntityKey[] = ["cohorts", "students", "submissions"];

export function buildExport(db: Database, selected: EntityKey[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of selected) {
    if (key === "bank") out["question_bank"] = db.bank;
    else out[key] = db[key];
  }
  return out;
}

export function entityCount(db: Database, key: EntityKey): number {
  if (key === "bank") return db.bank.length;
  return db[key].length;
}

/** Flatten an entity into CSV-friendly rows. */
export function entityRows(db: Database, key: EntityKey): Record<string, string | number>[] {
  switch (key) {
    case "cohorts":
      return db.cohorts.map((c) => ({ id: c.id, name: c.name, color: c.color, createdAt: c.createdAt }));
    case "students":
      return db.students.map((s) => ({
        id: s.id,
        username: s.username,
        email: s.email ?? "",
        cohort: db.cohorts.find((c) => c.id === s.cohortId)?.name ?? "",
        cohortId: s.cohortId,
        createdAt: s.createdAt,
      }));
    case "submissions":
      return db.submissions.map((s) => ({
        id: s.id,
        student: db.students.find((x) => x.id === s.studentId)?.username ?? "",
        test: db.tests.find((t) => t.id === s.testId)?.title ?? "",
        testId: s.testId,
        studentId: s.studentId,
        status: s.status,
        autoSubmitted: s.autoSubmitted ? "yes" : "no",
        submittedAt: s.submittedAt ?? "",
        durationSeconds: s.durationSeconds ?? 0,
        marksAwarded: awardedMarks(s),
      }));
    default:
      return [];
  }
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    // A cell starting with = + - @ would run as a formula in Excel or Sheets.
    const s = /^[=+\-@]/.test(String(v)) && typeof v === "string" ? `'${v}` : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  return lines.join("\n");
}

export function exportFilename(slug: string, dateIso: string, ext: string): string {
  const date = dateIso.slice(0, 10); // YYYY-MM-DD
  return `${slug}-export-${date}.${ext}`;
}

/**
 * One row per current student, one column per test (percent), plus their
 * average: the sheet to open in Excel or Google Sheets. Blank = not sat or
 * not marked yet.
 */
export function marksSheet(db: Database): Record<string, string | number>[] {
  const off = archivedCohortIds(db);
  const tests = db.tests
    .filter((t) => t.status !== "draft" && !(t.cohortId && off.has(t.cohortId)))
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  const cohortName = (id: string) => db.cohorts.find((c) => c.id === id)?.name ?? "";
  const label = (t: (typeof tests)[number]) => `${t.title} (${t.opensAt.slice(0, 10)}) %`;
  return db.students
    .filter((s) => !off.has(s.cohortId))
    .sort((a, b) => cohortName(a.cohortId).localeCompare(cohortName(b.cohortId)) || a.username.localeCompare(b.username))
    .map((s) => {
      const row: Record<string, string | number> = { Student: s.username.charAt(0).toUpperCase() + s.username.slice(1), Cohort: cohortName(s.cohortId) };
      const got: number[] = [];
      for (const t of tests) {
        const sub = db.submissions.find((x) => x.testId === t.id && x.studentId === s.id && x.status === "released");
        const pct = sub ? Math.round(gradeSubmission(t, sub).percent) : null;
        row[label(t)] = pct ?? "";
        if (pct !== null) got.push(pct);
      }
      row["Average %"] = got.length ? Math.round(got.reduce((n, x) => n + x, 0) / got.length) : "";
      return row;
    });
}
