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
    case "students": {
      const cohortName = new Map(db.cohorts.map((c) => [c.id, c.name]));
      return db.students.map((s) => ({
        id: s.id,
        username: s.username,
        email: s.email ?? "",
        cohort: cohortName.get(s.cohortId) ?? "",
        cohortId: s.cohortId,
        createdAt: s.createdAt,
      }));
    }
    case "submissions": {
      // Looked up through maps: a search per row froze the page on a year of scripts.
      const student = new Map(db.students.map((x) => [x.id, x.username]));
      const test = new Map(db.tests.map((t) => [t.id, t.title]));
      return db.submissions.map((s) => ({
        id: s.id,
        student: student.get(s.studentId) ?? "",
        test: test.get(s.testId) ?? "",
        testId: s.testId,
        studentId: s.studentId,
        status: s.status,
        autoSubmitted: s.autoSubmitted ? "yes" : "no",
        submittedAt: s.submittedAt ?? "",
        durationSeconds: s.durationSeconds ?? 0,
        marksAwarded: awardedMarks(s),
      }));
    }
    default:
      return [];
  }
}

/**
 * One CSV cell. Text that Excel or Sheets would run as a formula (it starts
 * with = + - @, a tab or a return) gets a leading apostrophe; real numbers are
 * left alone so -5 stays a number. Commas, quotes and line breaks are quoted.
 */
function csvCell(v: string | number | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Rows to CSV text. The header row is escaped like any other (a test title
 * with a comma used to push every column one place to the right), and lines
 * end with CRLF, which is what Excel expects.
 */
export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))];
  return lines.join("\r\n");
}

/** Put in front of a CSV so Excel reads names in any script (Urdu, Arabic, accents) correctly. */
export const CSV_BOM = "\uFEFF";

/** Today's date in Pakistan, "2026-11-10", for file names (the UTC date is yesterday's until 5 am). */
export function todayStamp(nowMs: number): string {
  return new Date(nowMs + 5 * 3_600_000).toISOString().slice(0, 10);
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
  const cohortNames = new Map(db.cohorts.map((c) => [c.id, c.name]));
  const cohortName = (id: string) => cohortNames.get(id) ?? "";
  // One column per test. The date is the Pakistan one, and two tests with the
  // same title on the same day each keep their own column (the second used to
  // overwrite the first).
  const seen = new Map<string, number>();
  const label = new Map<string, string>();
  for (const t of tests) {
    const base = `${t.title} (${todayStamp(+new Date(t.opensAt))}) %`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    label.set(t.id, n === 1 ? base : `${t.title} (${todayStamp(+new Date(t.opensAt))}, ${n}) %`);
  }
  // Released scripts by test and student, found once (not searched for every cell).
  const released = new Map<string, (typeof db.submissions)[number]>();
  for (const x of db.submissions) if (x.status === "released") released.set(`${x.testId}|${x.studentId}`, x);
  return db.students
    .filter((s) => !off.has(s.cohortId))
    .sort((a, b) => cohortName(a.cohortId).localeCompare(cohortName(b.cohortId)) || a.username.localeCompare(b.username))
    .map((s) => {
      const row: Record<string, string | number> = { Student: s.username.charAt(0).toUpperCase() + s.username.slice(1), Cohort: cohortName(s.cohortId) };
      const got: number[] = [];
      for (const t of tests) {
        const sub = released.get(`${t.id}|${s.id}`);
        const pct = sub ? Math.round(gradeSubmission(t, sub).percent) : null;
        row[label.get(t.id)!] = pct ?? "";
        if (pct !== null) got.push(pct);
      }
      row["Average %"] = got.length ? Math.round(got.reduce((n, x) => n + x, 0) / got.length) : "";
      return row;
    });
}
