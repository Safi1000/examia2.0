/**
 * Exam countdown study plan: a week-by-week plan from today to the exams,
 * rebuilt from the student's own marks every time it is opened, so weak
 * topics come round more often and the plan "adjusts" on its own.
 *
 * Pure function over data the portal already has (tests, topics, released
 * marks). Nothing is stored.
 */
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { testsForStudent } from "@/lib/data/selectors";
import { isVagueTopic, topicMastery } from "@/lib/scoring";
import { daysUntil, examsForStudent, nextExam, type ExamPaper } from "@/lib/exam-dates";

/**
 * The series as a whole: its first day and the past-paper window, confirmed by
 * Hamza (2026-10-16). Used by the public tools, and as the fallback for a
 * student whose class is not one of the taught levels. Each student's own
 * papers and dates come from lib/exam-dates.ts (Cambridge's final timetable).
 */
export const EXAMS = {
  name: "May / June 2027",
  start: "2027-04-26",
  pastPapersFrom: "2027-03-01",
};

const DAY = 86_400_000;

export interface PlanTopic {
  subject: string;
  name: string;
  /** Percent of marks so far, or null when never tested. */
  percent: number | null;
}

export interface PlanWeek {
  index: number;
  /** Monday of the week. */
  start: Date;
  phase: "learn" | "past-papers" | "final";
  topics: PlanTopic[];
  tests: { id: string; title: string }[];
  isCurrent: boolean;
}

export interface StudyPlan {
  /** Whole days to `examDate`. */
  daysLeft: number;
  /** The day the plan counts to: this student's next paper, or the series' first day when their papers are not known. */
  examDate: string;
  /** This student's own papers, in date order (empty when not known). */
  papers: ExamPaper[];
  weeksLeft: number;
  weeks: PlanWeek[];
  subjects: string[];
}

function mondayOf(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - shift);
  return d;
}

export function buildStudyPlan(db: Database, student: Student, nowMs: number): StudyPlan {
  // Local midnight (no "Z"), so week boundaries line up with Pakistan time.
  // Count to this student's own next paper; the series' first day only when their papers are not known.
  const papers = examsForStudent(db, student);
  const examDate = nextExam(papers, nowMs)?.date ?? (papers.length ? papers[papers.length - 1].date : EXAMS.start);
  const examMs = +new Date(`${examDate}T00:00:00`);
  const pastMs = +new Date(`${EXAMS.pastPapersFrom}T00:00:00`);
  const handedIn = new Set(
    db.submissions.filter((s) => s.studentId === student.id && s.status !== "in_progress").map((s) => s.testId),
  );
  const tests = testsForStudent(db, student);
  // Subjects from tests, plus the ones the student (or their cohort) is enrolled
  // in, so the plan has topics from the question bank before the first test.
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const enrolled = (student.subjectIds.length ? student.subjectIds : (cohort?.subjectIds ?? []))
    .map((id) => db.subjects.find((x) => x.id === id)?.name.trim())
    .filter((n): n is string => !!n);
  const subjects = Array.from(new Set([...tests.map((t) => t.subject.trim()), ...enrolled])).sort();

  // Every topic Hamza has tagged in this student's subjects (tests + bank).
  const topicKeys = new Map<string, PlanTopic>();
  const add = (subject: string, name: string) => {
    // Untagged, whole-syllabus and unit-only tags are no topic to revise: they stay out of the plan.
    if (isVagueTopic(name)) return;
    const n = name.trim();
    const key = `${subject.toLowerCase()}|${n.toLowerCase()}`;
    if (!topicKeys.has(key)) topicKeys.set(key, { subject, name: n, percent: null });
  };
  for (const t of tests) for (const q of t.questions) add(t.subject.trim(), q.topic);
  for (const b of db.bank) if (subjects.includes(b.subject.trim())) add(b.subject.trim(), b.topic);

  const released = db.submissions.filter((s) => s.studentId === student.id && s.status === "released");
  for (const m of topicMastery(db.tests, released)) {
    const key = `${m.subject.toLowerCase()}|${m.name.toLowerCase()}`;
    const t = topicKeys.get(key);
    if (t) t.percent = Math.round(m.percent);
  }

  // Weakest first; untested topics sit in the middle. Weak topics are queued
  // again (under 70% twice, under 50% three times) so they keep coming back.
  const rank = (t: PlanTopic) => (t.percent === null ? 60 : t.percent);
  const sorted = Array.from(topicKeys.values()).sort((a, b) => rank(a) - rank(b));
  const queue = [
    ...sorted,
    ...sorted.filter((t) => rank(t) < 70),
    ...sorted.filter((t) => rank(t) < 50),
  ];

  const weeks: PlanWeek[] = [];
  const first = mondayOf(nowMs);
  let cursor = 0;
  for (let i = 0, wk = +first; wk < examMs; i++, wk += 7 * DAY) {
    const end = wk + 7 * DAY;
    const phase: PlanWeek["phase"] = end > examMs - 7 * DAY ? "final" : wk >= pastMs ? "past-papers" : "learn";
    const want = phase === "learn" ? 2 : phase === "past-papers" ? 1 : 0;
    const picked: PlanTopic[] = [];
    for (let guard = 0; picked.length < want && queue.length && guard < queue.length * 2; guard++) {
      const t = queue[cursor % queue.length];
      cursor++;
      if (!picked.includes(t)) picked.push(t);
    }
    weeks.push({
      index: i,
      start: new Date(wk),
      phase,
      topics: picked,
      tests: tests
        .filter((t) => !handedIn.has(t.id) && +new Date(t.opensAt) < end && +new Date(t.closesAt) >= wk && +new Date(t.closesAt) > nowMs)
        .map((t) => ({ id: t.id, title: t.title })),
      isCurrent: nowMs >= wk && nowMs < end,
    });
  }

  const daysLeft = Math.max(0, daysUntil(examDate, nowMs));
  return { daysLeft, examDate, papers, weeksLeft: weeks.length, weeks, subjects };
}
