import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { attendancePercent, homeworkSetFor, testById } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";

/**
 * A student's figures, with the same sums as their own page in the console:
 *   attendance  this month (typed, or from the daily register), as on the page's tile
 *   homework    share of the homework set for them that is due (or already in) and handed in
 *   average     mean of their released test results; last = the newest one
 *   owed        homework past its deadline and not handed in
 * Null means nothing to count yet (shown as "–"), never 0.
 */
export type Figures = {
  attendance: number | null;
  homeworkDone: number | null;
  owed: number;
  average: number | null;
  last: number | null;
};

/** "2026-11-01": the month in Pakistan, as attendance is kept. */
export const pkMonthStart = (nowMs: number) => `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(nowMs)).slice(0, 7)}-01`;

export function studentFigures(db: Database, students: Student[], nowMs: number): Map<string, Figures> {
  const month = pkMonthStart(nowMs);
  const handIns = new Set(db.assignmentSubmissions.map((x) => `${x.studentId}|${x.assignmentId}`));
  const results = new Map<string, number[]>();
  const released = db.submissions.filter((x) => x.status === "released").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  for (const x of released) {
    const t = testById(db, x.testId);
    if (!t) continue;
    const list = results.get(x.studentId) ?? [];
    list.push(gradeSubmission(t, x).percent);
    results.set(x.studentId, list);
  }
  const out = new Map<string, Figures>();
  for (const s of students) {
    let counted = 0;
    let done = 0;
    let owed = 0;
    for (const a of db.assignments) {
      const handed = handIns.has(`${s.id}|${a.id}`);
      if (!handed && !homeworkSetFor(db, s, a)) continue;
      if (handed) {
        counted++;
        done++;
      } else if (+new Date(a.dueAt) <= nowMs) {
        counted++;
        owed++;
      }
    }
    const pts = results.get(s.id) ?? [];
    const att = attendancePercent(db, s.id, month);
    out.set(s.id, {
      attendance: att === null ? null : Math.round(att),
      homeworkDone: counted ? Math.round((done / counted) * 100) : null,
      owed,
      average: pts.length ? Math.round(pts.reduce((n, p) => n + p, 0) / pts.length) : null,
      last: pts.length ? Math.round(pts[pts.length - 1]) : null,
    });
  }
  return out;
}

/** "92%", or "–" when there is nothing to count. */
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n}%`);
