import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { archivedCohortIds, extensionFor, isArchivedTest, liveStatus, startedMs, testCoversStudent } from "@/lib/data/selectors";
import { displayName, isTestAccount } from "@/lib/display-name";
import { isPausedId } from "@/lib/paused";
import { parentLowScore, parentMissedTest, parentReport, parentSubjectAbsent } from "@/lib/portal-messages";
import { inPersonIds } from "@/lib/in-person";
import { awardedMarks, isFullyGraded, percent, totalMarks } from "@/lib/scoring";
import { addDays, pkDate } from "@/lib/timetable";
import type { ClassJoin } from "@/lib/classes";
import { attendingSubjects, awaySpells, classDay, missedStreaks, subjectAttendance, subjectNamer } from "@/lib/subject-attendance";
import { introNeeded, MSG_PARENT, SKIP_PREFIX } from "@/lib/sent-log";
import { joinAnd } from "@/lib/outgoing-message";

/** Results under this percentage are worth a word with the parents. */
export const LOW_SCORE = 70;

/**
 * What the admin still has to chase.
 *
 * Nothing is scheduled or stored: the list is derived from the data every time
 * the panel renders, minus whatever has already been sent. Everything on it
 * closes itself (see the numbers above dueReminders), and a student appears
 * at most once. Adding a new kind of
 * reminder means adding one entry to KINDS and one branch in `dueReminders` —
 * the panel, the dedupe and the send button need no changes.
 */

export type ReminderKind = "missed_test" | "absent_streak" | "low_score" | "report_due";

export interface Reminder {
  kind: ReminderKind;
  student: Student;
  /** What this reminder is about — test id, date, or month. Dedupe key. */
  ref: string;
  /** One line for the panel. */
  label: string;
  /** The WhatsApp message, ready to send. */
  message: string;
}

export const KINDS: Record<ReminderKind, { label: string; tone: "warning" | "error" | "brand" }> = {
  missed_test: { label: "Missed a test", tone: "warning" },
  absent_streak: { label: "Absent", tone: "error" },
  low_score: { label: "Low result", tone: "warning" },
  report_due: { label: "Report to send", tone: "brand" },
};

const monthName = (month: string) => {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
};

/*
 * How the list stays short (Hamza, 18 Nov 2026: the reminders were getting out
 * of hand; they should close themselves, and only the ones parents will value
 * should show). Change a number here and the whole list follows.
 */
/** A missed test, a low result or an absence closes itself this many days after it happened. */
export const CLOSES_AFTER_DAYS = 7;
/** Last month's report can be sent until this day of the month, then it closes itself. */
export const REPORT_UNTIL_DAY = 14;
/** One result under this is worth a word on its own. Between this and LOW_SCORE, only a second low result in a month is. */
export const SERIOUS_SCORE = 50;
/** After one message to a parent, nothing else about that student for this many days (the monthly report aside). */
export const COOL_OFF_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

/*
 * Today's own marks, kept in the same reminder log (kind is free text, so no
 * database change). "checked" (Done) was already there; these say which way
 * Hamza got in touch, and when a student is away with a reason.
 */
/** Hamza messaged the student from Today (or picked "Spoke to them"). ref: the day. */
export const CONTACT_STUDENT = "contact_student";
/** Hamza messaged the parent from Today (or picked "Parent knows"). ref: the day. */
export const CONTACT_PARENT = "contact_parent";
/** Away with a reason (exams, travel, illness) until this day. ref: YYYY-MM-DD. The latest one set wins. */
export const AWAY_UNTIL = "away_until";

/** Each student's "away until" day, the latest one Hamza set. Past days are kept: callers compare with today. */
export function awayUntilMap(db: Pick<Database, "remindersSent">): Map<string, string> {
  const best = new Map<string, { at: number; until: string }>();
  for (const r of db.remindersSent) {
    if (r.kind !== AWAY_UNTIL || !/^\d{4}-\d{2}-\d{2}$/.test(r.ref)) continue;
    const at = +new Date(r.sentAt);
    const had = best.get(r.studentId);
    if (!had || at > had.at) best.set(r.studentId, { at, until: r.ref });
  }
  return new Map([...best].map(([id, v]) => [id, v.until]));
}

/** Most important first: only one of these is shown for a student at a time. */
const PRIORITY: ReminderKind[] = ["absent_streak", "missed_test", "low_score"];

/**
 * `classes`: the class joins (lib/classes useClassLinks with joins) covering
 * the last few weeks. Without them, or when they could not be read, no
 * absence is offered (a failed read must never make someone look absent).
 */
export function dueReminders(db: Database, nowMs: number, cohortId: string | null, classes?: { joins: ClassJoin[]; joinsOk: boolean }): Reminder[] {
  // A skipped reminder ("skip:<kind>", same ref) never comes back, like a sent one.
  const sent = new Set(db.remindersSent.map((r) => `${r.studentId}|${r.kind.startsWith(SKIP_PREFIX) ? r.kind.slice(SKIP_PREFIX.length) : r.kind}|${r.ref}`));
  // Past students (switched-off cohorts) are never chased.
  const off = archivedCohortIds(db);
  // In-person students are managed in class: no parent messages or monthly reports from here.
  // Hamza's own test account is never chased either.
  const inPerson = inPersonIds(db);
  // Away with a reason Hamza set on Today (exams, travel): the parent already knows, so nothing until the day after.
  const today = pkDate(nowMs);
  const away = awayUntilMap(db);
  const students = db.students.filter(
    (s) => !off.has(s.cohortId) && !inPerson.has(s.id) && !isTestAccount(s) && !isPausedId(s.id) && (away.get(s.id) ?? "") < today && (cohortId ? s.cohortId === cohortId : true),
  );
  const fresh = (r: Reminder) => !sent.has(`${r.student.id}|${r.kind}|${r.ref}`);
  const OPEN = CLOSES_AFTER_DAYS * DAY;

  // A parent who heard from Hamza in the last week (from here, or Today's Parent button) is left alone: one message, then quiet.
  // Only messages about how the student is doing count: a login, a notifications how-to, a test
  // closing or a report sent from the student's page never hides these.
  const aboutThem = (r: { kind: string; ref: string }) => r.kind === MSG_PARENT && /^(absence|update|check_in):/.test(r.ref);
  const told = new Set(
    db.remindersSent
      .filter((r) => (PRIORITY.includes(r.kind as ReminderKind) || r.kind === CONTACT_PARENT || aboutThem(r)) && nowMs - new Date(r.sentAt).getTime() <= COOL_OFF_DAYS * DAY)
      .map((r) => r.studentId),
  );
  // At most one reminder per student from the three below, the most important one.
  const one = new Map<string, Reminder>();
  const offer = (r: Reminder) => {
    if (!fresh(r) || told.has(r.student.id)) return;
    const had = one.get(r.student.id);
    if (!had || PRIORITY.indexOf(r.kind) < PRIORITY.indexOf(had.kind)) one.set(r.student.id, r);
  };

  // 1. Missed the last two or more classes in ONE subject, in a row, even while coming to the
  // others (Hamza, 27 Nov 2026), and still current: the latest miss is within the week.
  // Per subject from the Join taps (lib/subject-attendance.ts). Offered once per spell:
  // the ref is the subject and the first missed day of the run.
  const attendance = classes?.joinsOk ? subjectAttendance(db, { joins: classes.joins, joinsOk: true, nowMs }) : null;
  const spells = awaySpells(db);
  // Absence spells already sent, marked done or skipped, by student and subject: the days they started on.
  const dealt = new Map<string, string[]>();
  for (const r of db.remindersSent) {
    if (r.kind !== "absent_streak" && r.kind !== `${SKIP_PREFIX}absent_streak`) continue;
    const m = /^(.+):(\d{4}-\d{2}-\d{2})$/.exec(r.ref);
    if (m) dealt.set(`${r.studentId}|${m[1]}`, [...(dealt.get(`${r.studentId}|${m[1]}`) ?? []), m[2]]);
  }
  for (const student of attendance ? students : []) {
    // Three weeks: the same window Today loads the joins for (a day with no joins loaded would look missed).
    const list = attendance!(student, addDays(today, -21), today);
    const runs = missedStreaks(list, spells.get(student.id)?.until ?? "")
      .filter((x) => x.missed.length >= 2 && nowMs - x.missed[0].startMs <= OPEN)
      // The same spell, already dealt with (its start day can move as the window moves, or another subject can lead): not again.
      .filter((x) => !(dealt.get(`${student.id}|${x.subjectId}`) ?? []).some((d) => d >= x.missed[x.missed.length - 1].date && d <= x.missed[0].date));
    const top = runs[0];
    if (!top) continue;
    const named = subjectNamer(list);
    const missedNames = runs.map(named);
    const fine = attendingSubjects(list, missedNames);
    const others = runs.slice(1);
    const first = top.missed[top.missed.length - 1];
    const n = top.missed.length;
    const intro = introNeeded(db, student.id, "parent");
    offer({
      kind: "absent_streak",
      student,
      ref: `${top.subjectId}:${first.date}`,
      label: `${displayName(student.username)} has missed the last ${n} ${named(top)} classes${others.length ? ` (and ${joinAnd(others.map(named))} too)` : ""}`,
      message: others.length
        ? // Several subjects at once: name them all, without days (they differ by subject).
          parentSubjectAbsent({ id: student.id, username: student.username, intro, subject: joinAnd(missedNames), missed: Math.min(...runs.map((x) => x.missed.length)), days: [], fine })
        : parentSubjectAbsent({
            id: student.id,
            username: student.username,
            intro,
            subject: named(top),
            missed: n,
            // Up to three days, oldest first; a longer run just says how many.
            days: n <= 3 ? top.missed.map(classDay).reverse() : [],
            fine,
          }),
    });
  }

  // 2. A test that closed in the last week with nothing handed in. One per
  // student (the latest), however many they missed. A student who joined after
  // the test opened owes nothing for it.
  const closed = db.tests
    .filter((t) => liveStatus(t, nowMs) === "closed" && nowMs - new Date(t.closesAt).getTime() <= OPEN && !isArchivedTest(db, t, off))
    .sort((a, b) => b.closesAt.localeCompare(a.closesAt));
  // Looked up once: scanning every submission for every student and test is slow with a full roster.
  const started = closed.length ? new Set(db.submissions.map((s) => `${s.testId}|${s.studentId}`)) : new Set<string>();
  for (const student of students) {
    const missed = closed.filter((test) => {
      if (!testCoversStudent(test, student)) return false;
      // Joined, or started this test's subject or level, after it opened: it was not theirs to miss.
      if (startedMs(db, student, test.classId, test.subjectId) > new Date(test.opensAt).getTime()) return false;
      if (started.has(`${test.id}|${student.id}`)) return false;
      // Reopened just for them and still open: not missed (yet).
      const ext = extensionFor(db, test.id, student.id);
      return !(ext && +new Date(ext.until) > nowMs);
    });
    const test = missed[0];
    if (!test) continue;
    offer({
      kind: "missed_test",
      student,
      ref: test.id,
      label: `${displayName(student.username)} did not sit "${test.title}"${missed.length > 1 ? ` (and ${missed.length - 1} more this week)` : ""}`,
      message: parentMissedTest({ id: student.id, username: student.username, intro: introNeeded(db, student.id, "parent"), title: test.title, subject: test.subject }),
    });
  }

  // 3. A low result released in the last week: under 50% on its own, or the
  // second result under 70% within a month. A single 60-something is not a
  // message to a parent.
  const byId = new Map(students.map((s) => [s.id, s]));
  const low = new Map<string, Array<{ subId: string; pct: number; at: number; title: string; subject: string }>>();
  for (const sub of db.submissions) {
    if (sub.status !== "released" || !sub.releasedAt) continue;
    const at = new Date(sub.releasedAt).getTime();
    if (nowMs - at > 30 * DAY) continue;
    const student = byId.get(sub.studentId);
    const test = db.tests.find((t) => t.id === sub.testId);
    if (!student || !test || isArchivedTest(db, test, off)) continue;
    const total = totalMarks(test);
    // Only results that are fully marked: an unmarked answer would count as zero.
    if (!total || !isFullyGraded(test, sub)) continue;
    const pct = percent(awardedMarks(sub), total);
    // Judged on the rounded figure the label shows, so "scored 70%" never sits under a low result.
    if (Math.round(pct) >= LOW_SCORE) continue;
    low.set(student.id, [...(low.get(student.id) ?? []), { subId: sub.id, pct, at, title: test.title, subject: test.subject }]);
  }
  for (const [studentId, list] of low) {
    const student = byId.get(studentId)!;
    const latest = list.sort((a, b) => b.at - a.at)[0];
    if (nowMs - latest.at > OPEN) continue;
    const serious = Math.round(latest.pct) < SERIOUS_SCORE;
    if (!serious && list.length < 2) continue;
    offer({
      kind: "low_score",
      student,
      ref: latest.subId,
      label: `${displayName(student.username)} scored ${Math.round(latest.pct)}% in "${latest.title}"${serious ? "" : `, ${list.length === 2 ? "the second" : `number ${list.length}`} low result this month`}`,
      message: parentLowScore({ id: student.id, username: student.username, intro: introNeeded(db, student.id, "parent"), pct: latest.pct, title: latest.title, subject: latest.subject }),
    });
  }

  const out: Reminder[] = [...one.values()].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));

  // 4. Last month's report, from the 1st to the 14th, then it closes itself. The
  // month turns over at midnight in Pakistan, whatever time zone the laptop or tablet is set to.
  const [pkYear, pkMonth, pkDay] = pkDate(nowMs).split("-").map(Number);
  if (pkDay > REPORT_UNTIL_DAY) return out;
  const lastMonth = new Date(Date.UTC(pkYear, pkMonth - 2, 1)).toISOString().slice(0, 7);
  const hadResults = new Set(
    db.submissions.filter((x) => x.status === "released" && (x.submittedAt ?? "").slice(0, 7) === lastMonth).map((x) => x.studentId),
  );
  for (const student of students) {
    // Nothing marked last month means nothing to report.
    if (!hadResults.has(student.id)) continue;
    const report = db.reports.find((r) => r.studentId === student.id && r.month.slice(0, 7) === lastMonth);
    if (report?.sentAt) continue;
    const r: Reminder = {
      kind: "report_due",
      student,
      ref: `${lastMonth}-01`,
      label: `${monthName(lastMonth)} report for ${displayName(student.username)}`,
      message: parentReport({ id: student.id, username: student.username, intro: introNeeded(db, student.id, "parent"), month: monthName(lastMonth) }),
    };
    if (fresh(r)) out.push(r);
  }

  return out;
}

/**
 * A deadline as a WhatsApp message says it, in real words a parent can read
 * hours later: "today at 9:00 PM", "tomorrow at 6:00 PM", "on Fri 14 Nov at
 * 9:00 PM", always in Pakistan time and saying so (Gulf families read it too).
 */
export function messageWhen(iso: string, nowMs: number): string {
  const at = new Date(iso);
  const zone = "Asia/Karachi";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: zone });
  const time = at.toLocaleTimeString("en-GB", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(am|pm)\b/i, (_, m: string) => ` ${m.toUpperCase()}`);
  const on =
    day(at) === day(new Date(nowMs))
      ? "today"
      : day(at) === day(new Date(nowMs + 86_400_000))
        ? "tomorrow"
        : `on ${at.toLocaleDateString("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short" })}`;
  return `${on} at ${time} Pakistan time`;
}
