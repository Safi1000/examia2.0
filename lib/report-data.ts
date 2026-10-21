/**
 * Everything a parent's monthly report says, worked out in one place.
 * Pure: reads the database snapshot, returns plain data. The PDF
 * (components/admin/ReportDocument.tsx) only lays it out.
 *
 * Rules that keep it honest:
 *  - "This month" = tests that closed in the month (set work) and results
 *    handed in during the month (marked work).
 *  - Results are listed in the order they were sat, with real marks.
 *  - Class average = every released result on the same test, so a parent can
 *    see a score in context.
 *  - Anything with no data (attendance, last month) is left out, never "—".
 */
import type { Database } from "@/lib/data/seed";
import type { Test } from "@/types";
import {
  cohortById,
  studentById,
  submissionsForStudent,
  testById,
  testsForStudent,
} from "@/lib/data/selectors";
import { gradeLetter, gradeSubmission, type GradeLetter } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { displayName } from "@/lib/display-name";

export interface ReportResult {
  title: string;
  subject: string;
  /** yyyy-mm-dd the work was handed in. */
  date: string;
  awarded: number;
  total: number;
  percent: number;
  /** Average of everyone's released results on this test; null if only this student sat it. */
  classAvg: number | null;
}

export interface ReportTopic {
  name: string;
  subject: string;
  percent: number;
  awarded: number;
  available: number;
}

export interface ReportData {
  name: string;
  firstName: string;
  cohort: string | null;
  subjects: string[];
  /** yyyy-mm. */
  month: string;
  monthLabel: string;
  summary: string;
  average: number | null;
  /** Rough Cambridge-style grade from the average, labelled "indicative" on the page. */
  grade: GradeLetter | null;
  prevAverage: number | null;
  change: number | null;
  classAverage: number | null;
  set: number;
  handedIn: number;
  awaiting: number;
  attendance: { percent: number; present: number; late: number; absent: number } | null;
  results: ReportResult[];
  strengths: ReportTopic[];
  focus: ReportTopic[];
  /** One line per subject: how many tests, the average, the class average, a plain verdict. */
  bySubject: Array<{ subject: string; tests: number; average: number; classAvg: number | null; grade: GradeLetter; verdict: string }>;
  /** Tests still open, soonest first: what is coming up. */
  upcoming: Array<{ title: string; closes: string }>;
  missed: Array<{ title: string; closed: string }>;
  /** Every test set this month, in closing order: handed in, missed, or still open. */
  dots: Array<"done" | "missed" | "open">;
  /** A short handwritten headline for the month. */
  headline: string;
  nextSteps: string[];
  teacherNote: string;
}

const monthOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : "");
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function reportData(db: Database, studentId: string, month: string, teacherNote = ""): ReportData | null {
  const student = studentById(db, studentId);
  if (!student) return null;
  if (!month) month = new Date().toISOString().slice(0, 7);
  const name = displayName(student.username);
  const firstName = name.split(" ")[0];

  const mine = submissionsForStudent(db, student.id);
  const released = mine.filter((s) => s.status === "released");

  const resultFor = (sub: (typeof released)[number]): ReportResult | null => {
    const t = testById(db, sub.testId);
    if (!t) return null;
    const g = gradeSubmission(t, sub);
    const others = db.submissions
      .filter((x) => x.testId === t.id && x.status === "released")
      .map((x) => gradeSubmission(t, x).percent);
    return {
      title: t.title,
      subject: t.subject,
      date: (sub.submittedAt ?? "").slice(0, 10),
      awarded: g.awarded,
      total: g.total,
      percent: round1(g.percent),
      classAvg: others.length > 1 ? mean(others) : null,
    };
  };

  const inMonth = (m: string) =>
    released
      .filter((s) => monthOf(s.submittedAt) === m)
      .map(resultFor)
      .filter((r): r is ReportResult => !!r)
      .sort((a, b) => a.date.localeCompare(b.date));

  const results = inMonth(month);
  const prev = inMonth(shiftMonth(month, -1));

  const average = mean(results.map((r) => r.percent));
  const prevAverage = mean(prev.map((r) => r.percent));
  const change = average != null && prevAverage != null ? round1(average - prevAverage) : null;
  const classAvgs = results.map((r) => r.classAvg).filter((x): x is number => x != null);
  const classAverage = mean(classAvgs);

  // Work set this month: tests for this student that closed in the month.
  const setTests: Test[] = testsForStudent(db, student).filter((t) => monthOf(t.closesAt) === month);
  const handed = new Set(mine.map((s) => s.testId));
  const handedIn = setTests.filter((t) => handed.has(t.id)).length;
  const awaiting = mine.filter((s) => s.status === "submitted" && monthOf(s.submittedAt) === month).length;
  const missed = setTests
    .filter((t) => !handed.has(t.id) && new Date(t.closesAt).getTime() < Date.now())
    .sort((a, b) => a.closesAt.localeCompare(b.closesAt))
    .map((t) => ({ title: t.title, closed: t.closesAt.slice(0, 10) }));

  // Attendance from the register (or a typed monthly figure).
  const typed = db.attendanceMonths.find((a) => a.studentId === student.id && a.month.slice(0, 7) === month);
  const days = db.attendanceDays.filter((a) => a.studentId === student.id && a.date.slice(0, 7) === month);
  const present = days.filter((d) => d.status === "present").length;
  const late = days.filter((d) => d.status === "late").length;
  const absent = days.filter((d) => d.status === "absent").length;
  const attendance = days.length
    ? { percent: round1(((present + late * 0.5) / days.length) * 100), present, late, absent }
    : typed
      ? { percent: typed.percent, present: 0, late: 0, absent: 0 }
      : null;

  // Topics from this month's marked work.
  const monthSubs = released.filter((s) => monthOf(s.submittedAt) === month);
  const tests = monthSubs.map((s) => testById(db, s.testId)).filter((t): t is Test => !!t);
  const mastery = topicMastery(tests, monthSubs).filter((m) => m.available > 0);
  const strengths = mastery
    .filter((m) => m.percent >= 70)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3)
    .map((m) => ({ name: m.name, subject: m.subject, percent: Math.round(m.percent), awarded: m.awarded, available: m.available }));
  const focus = mastery
    .filter((m) => m.percent < 70)
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 3)
    .map((m) => ({ name: m.name, subject: m.subject, percent: Math.round(m.percent), awarded: m.awarded, available: m.available }));

  const bySubject = Array.from(new Set(results.map((r) => r.subject))).map((subject) => {
    const rs = results.filter((r) => r.subject === subject);
    const average = mean(rs.map((r) => r.percent)) ?? 0;
    const classAvg = mean(rs.map((r) => r.classAvg).filter((x): x is number => x != null));
    const verdict =
      average >= 80 ? "Strong" : average >= 65 ? "Secure" : average >= 50 ? "Getting there" : "Needs support";
    return { subject, tests: rs.length, average, classAvg, grade: gradeLetter(average), verdict };
  });
  const upcoming = testsForStudent(db, student)
    .filter((t) => !handed.has(t.id) && new Date(t.closesAt).getTime() >= Date.now())
    .sort((a, b) => a.closesAt.localeCompare(b.closesAt))
    .slice(0, 3)
    .map((t) => ({ title: t.title, closes: t.closesAt.slice(0, 10) }));

  const subjects = student.subjectIds
    .map((id) => db.subjects.find((s) => s.id === id)?.name)
    .filter((s): s is string => !!s);
  if (!subjects.length) subjects.push(...Array.from(new Set(results.map((r) => r.subject))));

  // Plain sentences a parent can read in ten seconds: what was done, how it
  // went against the class, and the one best and one weakest topic, with marks.
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const stillOpen = setTests.length - handedIn - missed.length;
  const sentences: string[] = [];
  if (setTests.length) {
    sentences.push(
      `This month ${firstName} handed in ${handedIn} of the ${setTests.length} tests set` +
        (missed.length ? `, missed ${missed.length}` : "") +
        (stillOpen > 0 ? `, and ${stillOpen} ${stillOpen === 1 ? "is" : "are"} still open` : "") +
        ".",
    );
  } else if (results.length) {
    sentences.push(`This month ${firstName} had ${results.length} test${results.length === 1 ? "" : "s"} marked.`);
  }
  if (average != null) {
    let t = `${firstName}'s average was ${Math.round(average)}%`;
    if (classAverage != null) {
      const d = Math.round(average - classAverage);
      t += d >= 3 ? `, above the class average of ${Math.round(classAverage)}%` : d <= -3 ? `, below the class average of ${Math.round(classAverage)}% on the same tests` : `, in line with the class (${Math.round(classAverage)}%)`;
    }
    if (change != null && Math.abs(change) >= 2) t += `, and ${change > 0 ? "up" : "down"} ${Math.abs(Math.round(change))} points on last month`;
    sentences.push(`${t}.`);
  }
  if (strengths[0] || focus[0]) {
    const best = strengths[0] ? `Best topic: ${strengths[0].name} (${strengths[0].awarded} of ${strengths[0].available} marks).` : "";
    const worst = focus[0] ? `Needs most work: ${focus[0].name} (${focus[0].awarded} of ${focus[0].available} marks).` : "";
    sentences.push([best, worst].filter(Boolean).join(" "));
  }
  const summary = sentences.length ? sentences.join(" ") : `No marked work for ${firstName} this month yet.`;

  // Specific, dated actions: what I will do, what is coming, what helps at home.
  // Short, scannable actions: a label and the specifics, nothing more.
  const nextSteps: string[] = [];
  if (focus.length) nextSteps.push(`Extra practice: ${focus.map((f) => f.name).slice(0, 2).join(", ")}`);
  if (upcoming.length) nextSteps.push(`Next test: ${upcoming[0].title} · ${fmt(upcoming[0].closes)}`);
  if (missed.length) nextSteps.push(`Catch up: ${missed.length} missed test${missed.length === 1 ? "" : "s"}`);
  if (attendance && attendance.percent < 85) nextSteps.push("Attend every class");

  return {
    name,
    firstName,
    cohort: cohortById(db, student.cohortId)?.name ?? null,
    subjects,
    month,
    monthLabel: monthLabel(month),
    summary,
    average,
    grade: average != null ? gradeLetter(average) : null,
    prevAverage,
    change,
    classAverage,
    set: setTests.length,
    handedIn,
    awaiting,
    attendance,
    results,
    strengths,
    focus,
    bySubject,
    upcoming,
    missed,
    dots: setTests
      .slice()
      .sort((a, b) => a.closesAt.localeCompare(b.closesAt))
      .map((t) => (handed.has(t.id) ? "done" : new Date(t.closesAt).getTime() < Date.now() ? "missed" : "open")),
    headline:
      average == null
        ? "A fresh start"
        : change != null && change >= 5
          ? "Improving"
          : average >= 80
            ? "A strong month"
            : average >= 65
              ? "Steady progress"
              : average >= 50
                ? "Getting there"
                : "Needs support",
    nextSteps: nextSteps.slice(0, 3),
    teacherNote: teacherNote.trim(),
  };
}
