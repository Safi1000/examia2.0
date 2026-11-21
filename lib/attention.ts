/**
 * For Hamza only: who opened each class recording, and which students need
 * him today. Pure functions over data the teacher pages already load (the
 * store, class links and joins, students' profiles, activity), so nothing
 * new is stored and students never see any of it.
 */
import type { Assignment, Student, Submission, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import type { Profile } from "@/lib/profile";
import type { StudentActivity } from "@/lib/activity";
import { lastSeen } from "@/lib/activity";
import type { ClassJoin, ClassLink } from "@/lib/classes";
import { addDays, getSchedule, liveSlotsOn, pkDate, RECORDING_HOURS, slotKey, slotsForStudent, type DaySlot } from "@/lib/timetable";
import { countedDays, countsFor, eligibleStudents, extensionFor, joinedMs, startedMs, testById } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { currentStats } from "@/lib/focus";
import { LOW_SCORE } from "@/lib/reminders";
import { clean, count, joinAnd, low } from "@/lib/outgoing-message";

/** `missed "A" and "B"` when every title is there, else `missed 2 tests` / `missed a test`. For the parent message. */
function namedOrCounted(verb: string, titles: string[], one: string, many: string) {
  const named = titles.map(clean).filter(Boolean);
  if (named.length && named.length === titles.length) return `${verb} ${joinAnd(named.map((t) => `"${t}"`))}`;
  return `${verb} ${titles.length > 1 ? count(titles.length, one, many) : one}`;
}

const DAY = 86_400_000;
/** "Not on the portal" and "No Groundwork" wait until a student has been here this long. */
const FIRST_WEEK_MS = 7 * DAY;

// ---- Recordings -------------------------------------------------------------

export interface SlotRecording {
  slot: DaySlot;
  key: string;
  recordingUrl: string;
  /** When students can no longer open it (RECORDING_HOURS after the class ends). */
  closesMs: number;
  open: boolean;
  /** Everyone who belongs to this class (level and subject), test account and in-person students left out. */
  enrolled: Student[];
  joined: Student[];
  /** Opened the recording without joining live. */
  opened: Student[];
  neither: Student[];
  /** Nobody's join or attendance was recorded, so "did neither" can't be trusted. */
  noJoinData: boolean;
}

/**
 * Every class from `from` to `to` (Pakistan dates) that has ended and has a
 * recording, newest first, split into joined live / opened the recording / neither.
 *
 * Joined live: tapped Join for this class (class_joins). A student marked
 * present or late in the register for that level and day, with no Join tap
 * that day at all, also counts (the register was filled in by hand). Opened:
 * the class is in the student's `watched` list (set when they tap Watch).
 * `students` must already be the ones Hamza counts (in scope, not archived,
 * not the test account, not in person).
 */
export function recordingReport(
  db: Database,
  opts: { links: ClassLink[]; joins: ClassJoin[]; profiles: Record<string, Profile>; students: Student[]; from: string; to: string; nowMs: number },
): SlotRecording[] {
  const { links, joins, profiles, students, from, to, nowMs } = opts;
  const linkBy = new Map(links.filter((l) => l.recordingUrl).map((l) => [slotKey(l), l.recordingUrl as string]));
  if (!linkBy.size) return [];
  const joinedSlot = new Set(joins.map((j) => `${j.studentId}|${slotKey(j)}`));
  const joinedDay = new Set(joins.map((j) => `${j.studentId}|${j.date}`));
  const present = new Set(
    db.attendanceDays.filter((a) => a.status !== "absent" && a.date >= from && a.date <= to && countsFor(students.find((s) => s.id === a.studentId), a.date, a.status)).map((a) => `${a.studentId}|${a.classId ?? ""}|${a.date}`),
  );
  const watched = new Map(students.map((s) => [s.id, new Set(profiles[s.id]?.watched ?? [])]));

  const out: SlotRecording[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const slots = liveSlotsOn(db, d).filter((s) => s.endMs <= nowMs && linkBy.has(slotKey(s)));
    if (!slots.length) continue;
    const enrolledBy = new Map<string, Student[]>();
    // Only classes that started after the student was added: a class from before they joined was never theirs to miss.
    for (const st of students)
      for (const sl of slotsForStudent(db, st, d)) if (sl.startMs >= joinedMs(st)) enrolledBy.set(slotKey(sl), [...(enrolledBy.get(slotKey(sl)) ?? []), st]);
    // Latest class of the day first.
    for (const slot of slots.toReversed()) {
      const key = slotKey(slot);
      const enrolled = enrolledBy.get(key) ?? [];
      // A class nobody counted belongs to (no students at that level yet) has nothing to show.
      if (!enrolled.length) continue;
      const joined: Student[] = [];
      const opened: Student[] = [];
      const neither: Student[] = [];
      for (const st of enrolled) {
        const inClass =
          joinedSlot.has(`${st.id}|${key}`) ||
          (!joinedDay.has(`${st.id}|${d}`) && (present.has(`${st.id}|${slot.classId}|${d}`) || present.has(`${st.id}||${d}`)));
        if (inClass) joined.push(st);
        else if (watched.get(st.id)?.has(key)) opened.push(st);
        else neither.push(st);
      }
      const closesMs = slot.endMs + RECORDING_HOURS * 3_600_000;
      out.push({ slot, key, recordingUrl: linkBy.get(key)!, closesMs, open: nowMs < closesMs, enrolled, joined, opened, neither, noJoinData: enrolled.length > 0 && joined.length === 0 });
    }
  }
  return out;
}

// ---- Groundwork ----------------------------------------------------------------

const MAX_WEEK_MIN = 70 * 60;
/**
 * This week's Groundwork minutes, believed only as far as they add up (the
 * same rule as the leaderboard and the "Focused most" card): this week's days
 * at most 16 h each, never more than the week total, never more than 70 h.
 */
export function groundworkWeekMinutes(p: Profile | undefined, nowMs: number): number {
  if (!p?.focus) return 0;
  const st = currentStats(p.focus, nowMs);
  const fromDays = Object.entries(st.days ?? {})
    .filter(([d]) => d >= (st.weekOf ?? ""))
    .reduce((n, [, m]) => n + Math.min(960, Math.max(0, Number(m) || 0)), 0);
  return Math.round(Math.min(MAX_WEEK_MIN, Math.max(0, Number(st.weekMinutes) || 0), fromDays));
}

/** The last Pakistan day with any Groundwork time, not counting days in the future. */
function lastStudyDay(p: Profile | undefined, today: string): string | null {
  let best: string | null = null;
  for (const [d, m] of Object.entries(p?.focus?.days ?? {})) {
    const v = Number(m);
    if (!(v > 0 && v <= 960) || d > today) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

export const fmtMinutes = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

// ---- Students who need Hamza today ----------------------------------------------

export type ReasonKind = "missed_test" | "absent_streak" | "low_score" | "homework_missing" | "homework_late" | "recording" | "signin" | "groundwork";

/**
 * How likely each reason means a student is drifting away (Hamza, 20 Nov 2026:
 * the list is for cutting churn). Stopping showing up weighs most; a low mark
 * from a student who still turns up weighs less. A row's score is the sum.
 */
export const REASON_WEIGHT: Record<ReasonKind, number> = {
  absent_streak: 5,
  signin: 4,
  recording: 3,
  missed_test: 3,
  homework_missing: 2,
  low_score: 2,
  groundwork: 1,
  homework_late: 1,
};
/** Signs of someone fading out (not just struggling). Two or more different ones together is the strongest sign of all. */
const FADING: ReasonKind[] = ["absent_streak", "signin", "recording", "missed_test", "homework_missing"];
/** Each fading sign past the first adds this much on top. */
const FADING_BONUS = 3;
/**
 * A score at or above this is shown as "At risk of leaving". Two sick days on
 * their own score 5 (the missed recordings are the same classes, so they are
 * shown but not counted again): it takes a second, different sign to get here.
 */
export const AT_RISK = 8;
/** Below this a row is a small thing (No Groundwork, one late homework): it waits under "more", not at the top. */
export const NEEDS_YOU = 3;
/** Reasons that bring a student back after Done when a newer one appears (a new absence, a missed test). */
const RESURFACE: ReasonKind[] = ["missed_test", "absent_streak", "low_score", "homework_missing", "recording"];

export interface Reason {
  kind: ReasonKind;
  /** The chip Hamza sees. */
  label: string;
  /**
   * The same fact in words fit for a parent, or null when it would reveal what the portal tracks.
   * Written to follow the student's name in a sentence ("Amelia missed ..."), lower case, no full stop.
   */
  parent: string | null;
  /** When it happened (ms), when that is known: decides "new since you checked". */
  at?: number;
  /** Shown as a chip but not added to the score (the same missed classes as an absence streak). */
  counted?: boolean;
}

/** Today's suggested next step: the student first, then the parent, then a call. */
export interface NextStep {
  step: "student" | "parent" | "call";
  /** When the last step was taken with no sign of them since, ms (for "Messaged on 12 Nov, no change"). */
  since: number | null;
}

export interface AttentionRow {
  student: Student;
  reasons: Reason[];
  score: number;
  /** Rotation: nothing wrong, but not checked in with for a while. */
  rotation: boolean;
  /** When Hamza last marked them Done (or messaged them from Today), ms. */
  lastChecked: number | null;
  /** Whole days since then, or null for never. */
  daysSinceCheck: number | null;
  /** Something heavier happened after the last Done: back on the list early. */
  newSinceCheck: boolean;
  doingWell: boolean;
  /** One line of good news, or null. */
  good: string | null;
  missed: Test[];
  lastPct: number | null;
  /** The low mark is recent enough to talk about (ATTENTION.lowScoreDays). */
  lowRecent: boolean;
  absent: number;
  missingHomework: Assignment[];
  recordings: SlotRecording[];
  /** The last sign of them (portal, sign-in, class joined or attended, work handed in), ms. Null: none known. */
  lastHere: number | null;
  /** Joined in the last ATTENTION.newDays and not spoken to yet. */
  isNew: boolean;
  /** Has been in a class since joining (for the "how was your first class?" hello). */
  hadClass: boolean;
  next: NextStep;
}

/** Thresholds, in one place so they are easy to change. */
export const ATTENTION = {
  testDays: 14,
  homeworkDays: 14,
  recordingDays: 7,
  groundworkDays: 6,
  signinDays: 5,
  rotationDays: 14,
  hideDays: 7,
  /** A low mark older than this is old news, on Today and in the Parent message. */
  lowScoreDays: 14,
  /** "New this week": joined this recently and not spoken to yet. */
  newDays: 10,
  /** After a message with no sign of them for this long, the next step moves up (student, parent, call). */
  ladderDays: 3,
  /** Messages older than this no longer count for the next step. */
  contactDays: 21,
  /** "Since you messaged" looks back this far. */
  followDays: 7,
} as const;

/** Contact marks in the reminder log (lib/reminders.ts). */
const CONTACT = { student: "contact_student", parent: "contact_parent" } as const;

export interface AttentionResult {
  /** Real risks, heaviest first (score at least NEEDS_YOU). */
  problems: AttentionRow[];
  /** Small things only (below NEEDS_YOU). */
  minor: AttentionRow[];
  /** Nothing wrong, not spoken to for two weeks. */
  rotation: AttentionRow[];
  /** Joined in the last ten days and not spoken to yet. */
  newcomers: AttentionRow[];
  /** Kept off the list with a reason until a date. */
  away: Array<{ student: Student; until: string }>;
  /** Messaged from Today in the last week while away: who has been back since. Null while activity loads. */
  followUp: { cameBack: Student[]; stillAway: Student[] } | null;
  /** Every student's row, unfiltered (Analytics and the Roster rank by it). */
  all: AttentionRow[];
}

export function buildAttention(
  db: Database,
  opts: {
    students: Student[];
    tests: Test[];
    nowMs: number;
    checked: Record<string, number>;
    profiles: Record<string, Profile>;
    profilesReady: boolean;
    activity: Record<string, StudentActivity> | null;
    recordings: SlotRecording[];
    /** Class joins from the last week or so: being in class counts as being here. */
    joins?: ClassJoin[];
    /** "Away until" days by student (lib/reminders awayUntilMap). */
    awayUntil?: Map<string, string>;
  },
): AttentionResult {
  const { students, tests, nowMs, checked, profiles, profilesReady, activity, recordings, joins = [], awayUntil = new Map<string, string>() } = opts;
  const today = pkDate(nowMs);
  const ids = new Set(students.map((s) => s.id));
  const noon = (ymd: string) => Date.parse(`${ymd}T12:00:00+05:00`);
  const endOf = (ymd: string) => Date.parse(`${ymd}T23:59:59+05:00`);
  // When a register mark happened: that level's first class that day on the timetable, else the
  // day's last class end, else the end of the day. (Noon made a morning Done undo itself.)
  const dayCache = new Map<string, DaySlot[]>();
  const classTime = (classId: string | null, ymd: string) => {
    if (!dayCache.has(ymd)) dayCache.set(ymd, liveSlotsOn(db, ymd));
    const slots = dayCache.get(ymd)!;
    const mine = classId ? slots.filter((x) => x.classId === classId) : [];
    if (mine.length) return Math.min(...mine.map((x) => x.startMs));
    if (slots.length) return Math.max(...slots.map((x) => x.endMs));
    return endOf(ymd);
  };

  // Every sign of each student being here, one pass per source. The phone app's
  // screens don't record visits, so classes and hand-ins keep app users from looking away.
  const signs = new Map<string, number[]>();
  const sign = (id: string, ms: number) => {
    if (!ids.has(id) || !Number.isFinite(ms) || ms <= 0 || ms > nowMs) return;
    const l = signs.get(id);
    if (l) l.push(ms);
    else signs.set(id, [ms]);
  };
  const inClass = new Map<string, number>();
  const classSign = (id: string, ms: number) => {
    sign(id, ms);
    if (ms > (inClass.get(id) ?? 0)) inClass.set(id, ms);
  };
  for (const j of joins) classSign(j.studentId, j.joinedAt ? Date.parse(j.joinedAt) : noon(j.date));
  for (const a of db.attendanceDays) if (a.status !== "absent" && ids.has(a.studentId)) classSign(a.studentId, Math.min(classTime(a.classId, a.date), nowMs));
  for (const x of db.submissions) if (x.status !== "in_progress" && x.submittedAt) sign(x.studentId, Date.parse(x.submittedAt));
  for (const x of db.assignmentSubmissions) sign(x.studentId, Date.parse(x.submittedAt));
  if (activity) for (const s of students) { const t = lastSeen(activity[s.id]); if (t) sign(s.id, t); }
  const lastHereOf = (id: string) => Math.max(0, ...(signs.get(id) ?? [])) || null;
  const hereAfter = (id: string, ms: number) => (signs.get(id) ?? []).some((t) => t > ms);
  const lastBefore = (id: string, ms: number) => Math.max(0, ...(signs.get(id) ?? []).filter((t) => t <= ms)) || null;

  // How Hamza last got in touch from Today, per student (newest of each kind).
  const contact = new Map<string, { student: number; parent: number }>();
  for (const r of db.remindersSent) {
    if (r.kind !== CONTACT.student && r.kind !== CONTACT.parent) continue;
    const c = contact.get(r.studentId) ?? { student: 0, parent: 0 };
    const at = +new Date(r.sentAt);
    if (r.kind === CONTACT.student) c.student = Math.max(c.student, at);
    else c.parent = Math.max(c.parent, at);
    contact.set(r.studentId, c);
  }

  // Tests that closed in the last two weeks: who should have sat them, who did.
  const recent = tests
    .filter((t) => +new Date(t.closesAt) <= nowMs && nowMs - +new Date(t.closesAt) < ATTENTION.testDays * DAY)
    .map((t) => ({
      t,
      eligible: new Set(eligibleStudents(db, t).map((e) => e.id)),
      done: new Set(db.submissions.filter((s) => s.testId === t.id && s.status !== "in_progress").map((s) => s.studentId)),
    }));

  const latestReleased = new Map<string, Submission>();
  for (const x of db.submissions) {
    if (x.status !== "released" || !ids.has(x.studentId)) continue;
    const cur = latestReleased.get(x.studentId);
    if (!cur || (x.submittedAt ?? "").localeCompare(cur.submittedAt ?? "") > 0) latestReleased.set(x.studentId, x);
  }

  // The register, only days from joining on (the same rule as absenceStreak, so
  // a mark from before a student joined never shows here).
  const register = { attendanceDays: db.attendanceDays.filter((a) => ids.has(a.studentId)), students };

  // Homework due in the last two weeks, and each student's hand-ins.
  const dueRecently = db.assignments.filter((a) => +new Date(a.dueAt) <= nowMs && nowMs - +new Date(a.dueAt) < ATTENTION.homeworkDays * DAY);
  // Homework due in the last two weeks or still open: the ids whose Groundwork focus time counts as good news.
  const recentHomework = db.assignments.filter((a) => +new Date(a.dueAt) > nowMs - ATTENTION.homeworkDays * DAY).map((a) => a.id);
  const handIn = new Map(db.assignmentSubmissions.map((x) => [`${x.studentId}|${x.assignmentId}`, x]));

  // Classes in the last week each student neither joined nor opened (open recordings or closed, both count).
  const recMissed = new Map<string, SlotRecording[]>();
  if (profilesReady)
    for (const r of recordings) {
      if (r.noJoinData || nowMs - r.slot.endMs > ATTENTION.recordingDays * DAY) continue;
      for (const s of r.neither) recMissed.set(s.id, [...(recMissed.get(s.id) ?? []), r]);
    }

  const term = getSchedule().termStarts;
  const gwOn = profilesReady && today >= term;
  const neverCounts = today >= addDays(term, 7);

  const rows: AttentionRow[] = students.map((s) => {
    const reasons: Reason[] = [];
    // Away with a reason until a day: nothing up to the end of that day counts against them.
    const until = awayUntil.get(s.id) ?? null;
    const excusedTo = until ? endOf(until) : 0;
    const push = (r: Reason) => {
      if (r.at !== undefined && r.at <= excusedTo) return;
      reasons.push(r);
    };

    // Not missed when they joined after it opened (the parent reminder's rule), or while Hamza's reopening for them still runs.
    const missed = recent
      .filter((r) => {
        if (!r.eligible.has(s.id) || r.done.has(s.id) || startedMs(db, s, r.t.classId, r.t.subjectId) > +new Date(r.t.opensAt)) return false;
        const ext = extensionFor(db, r.t.id, s.id);
        return !(ext && +new Date(ext.until) > nowMs);
      })
      .map((r) => r.t)
      .filter((t) => +new Date(t.closesAt) > excusedTo);
    if (missed.length) {
      const l = `Missed ${missed.map((t) => t.title).join(", ")}`;
      push({ kind: "missed_test", label: l, parent: namedOrCounted("missed", missed.map((t) => t.title), "a test", "tests"), at: Math.max(...missed.map((t) => +new Date(t.closesAt))) });
    }
    const latest = latestReleased.get(s.id);
    const latestTest = latest ? testById(db, latest.testId) : undefined;
    const lastPct = latest && latestTest ? Math.round(gradeSubmission(latestTest, latest).percent) : null;
    // Only a recent low mark: an old one reported as "recently" to a parent is unfair.
    const lowAt = latest ? Date.parse(latest.releasedAt ?? latest.submittedAt ?? "") : NaN;
    const lowRecent = lastPct !== null && lastPct < LOW_SCORE && Number.isFinite(lowAt) && nowMs - lowAt < ATTENTION.lowScoreDays * DAY;
    if (lowRecent) reasons.push({ kind: "low_score", label: `Last test ${lastPct}%`, parent: `got ${lastPct}% in the last test`, at: lowAt });

    // Absences in a row, newest first, only those after an "away until" day.
    let absent = 0;
    let lastAbsentAt = 0;
    for (const d of countedDays(register, s.id).sort((a, b) => b.date.localeCompare(a.date))) {
      if (d.status !== "absent" || (until && d.date <= until)) break;
      if (!absent) lastAbsentAt = classTime(d.classId, d.date);
      absent++;
    }
    if (absent >= 2) push({ kind: "absent_streak", label: `Absent ${absent} classes in a row`, parent: `has missed the last ${count(absent, "class", "classes")}`, at: lastAbsentAt });

    // The same "who it was set for" rule as the Homework page's hand-in list.
    const owed = dueRecently.filter(
      (a) =>
        a.cohortId === s.cohortId &&
        startedMs(db, s, a.classId, a.subjectId) < +new Date(a.dueAt) &&
        (!a.classId || s.classIds.includes(a.classId)) &&
        (!a.subjectId || s.subjectIds.includes(a.subjectId)),
    );
    const missingHomework = owed.filter((a) => !handIn.has(`${s.id}|${a.id}`) && +new Date(a.dueAt) > excusedTo);
    const late = owed.filter((a) => {
      const x = handIn.get(`${s.id}|${a.id}`);
      return x && +new Date(x.submittedAt) > +new Date(a.dueAt);
    });
    if (missingHomework.length) {
      const l = missingHomework.length === 1 ? `Homework missing: ${missingHomework[0].title}` : `${missingHomework.length} homeworks missing`;
      const one = clean(missingHomework[0].title);
      const p =
        missingHomework.length === 1
          ? `has not handed in ${one ? `the homework "${one}"` : "a homework"} yet`
          : `has ${count(missingHomework.length, "homework")} still to hand in`;
      push({ kind: "homework_missing", label: l, parent: p, at: Math.max(...missingHomework.map((a) => +new Date(a.dueAt))) });
    }
    if (late.length) {
      const l = late.length === 1 ? `Homework late: ${late[0].title}` : `${late.length} homeworks handed in late`;
      const one = clean(late[0].title);
      const p = late.length === 1 ? `handed in ${one ? `the homework "${one}"` : "a homework"} late` : `handed in ${count(late.length, "homework")} late`;
      reasons.push({ kind: "homework_late", label: l, parent: p });
    }

    const recs = (recMissed.get(s.id) ?? []).filter((r) => r.slot.endMs > excusedTo);
    if (recs.length) {
      const day = (r: SlotRecording) => new Date(r.slot.startMs).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Karachi" });
      const at = Math.max(...recs.map((r) => r.slot.endMs));
      // Inside an absence streak these are the same missed classes: shown, not counted twice.
      const counted = absent < 2;
      push(
        recs.length === 1
          ? { kind: "recording", label: `Missed ${recs[0].slot.subject} on ${day(recs[0])}, recording not opened`, parent: `missed ${low(recs[0].slot.subject) ? `the ${low(recs[0].slot.subject)} class` : "a class"}${low(day(recs[0])) ? ` on ${low(day(recs[0]))}` : ""}`, at, counted }
          : { kind: "recording", label: `Missed ${recs.length} classes, recordings not opened`, parent: `missed ${count(recs.length, "class", "classes")} this week`, at, counted },
      );
    }

    // Activity: the last sign of them (portal, sign-in, class, hand-in). No activity entry means unknown, so no reason.
    // A student in their first week has not had time to fall behind on signing in or Groundwork.
    const settled = nowMs - joinedMs(s) >= FIRST_WEEK_MS;
    const act = activity?.[s.id];
    const lastHere = lastHereOf(s.id);
    if (act && settled) {
      const seen = Math.max(lastHere ?? 0, excusedTo) || null;
      if (seen === null) reasons.push({ kind: "signin", label: "Never signed in", parent: null });
      else {
        const days = Math.floor((nowMs - seen) / DAY);
        if (days >= ATTENTION.signinDays) reasons.push({ kind: "signin", label: `Not on the portal for ${days} days`, parent: null });
      }
    }

    const p = profiles[s.id];
    const backFor = until ? Math.floor((nowMs - excusedTo) / DAY) : Infinity;
    if (gwOn && settled && backFor >= ATTENTION.groundworkDays) {
      const last = lastStudyDay(p, today);
      if (last ? last < addDays(today, -(ATTENTION.groundworkDays - 1)) : neverCounts) {
        const ago = last ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / DAY) : null;
        reasons.push({ kind: "groundwork", label: ago === null ? "No focus time yet" : `No focus time in ${ago} days`, parent: null });
      }
    }

    const lastChecked = checked[s.id] || null;
    const daysSinceCheck = lastChecked ? Math.floor((nowMs - lastChecked) / DAY) : null;
    const newSinceCheck = !!lastChecked && reasons.some((r) => RESURFACE.includes(r.kind) && (r.at ?? 0) > lastChecked);
    const week = groundworkWeekMinutes(p, nowMs);
    const goodBits: string[] = [];
    if (week > 0) goodBits.push(`${fmtMinutes(week)} in Focus this week`);
    // Focus time on recent homework, from the activity file (absent when there is none). At most 16 h per homework is believed.
    const hwFocus = act?.focusHomework;
    const hwMin = hwFocus ? Math.round(recentHomework.reduce((n, id) => n + Math.min(960 * 60, Math.max(0, Number(hwFocus[id]) || 0)), 0) / 60) : 0;
    if (hwMin > 0) goodBits.push(`${fmtMinutes(hwMin)} focused on recent homework`);
    if (lastPct !== null && lastPct >= 80) goodBits.push(`last test ${lastPct}%`);
    const good = goodBits.length ? goodBits.join(", ").replace(/^./, (c) => c.toUpperCase()) : null;
    // Several different fading signs at once is worth more than their sum: that is how a student quietly leaves.
    const scored = reasons.filter((r) => r.counted !== false);
    const fading = new Set(scored.filter((r) => FADING.includes(r.kind)).map((r) => r.kind)).size;
    const score = scored.reduce((n, r) => n + REASON_WEIGHT[r.kind], 0) + (fading >= 2 ? FADING_BONUS * (fading - 1) : 0);

    // The next step: a message to the student; three days on with no sign of them, the parent; then a call.
    // "No sign" is only claimed once the activity has loaded.
    const c = contact.get(s.id);
    const fresh = (t: number | undefined) => (t && nowMs - t < ATTENTION.contactDays * DAY ? t : 0);
    const quietSince = (t: number) => !!activity && nowMs - t >= ATTENTION.ladderDays * DAY && !hereAfter(s.id, t);
    const sP = fresh(c?.parent);
    const sS = fresh(c?.student);
    const next: NextStep = sP && quietSince(sP) ? { step: "call", since: sP } : sS && quietSince(sS) ? { step: "parent", since: sS } : { step: "student", since: null };

    return {
      student: s,
      reasons,
      score,
      rotation: false,
      lastChecked,
      daysSinceCheck,
      newSinceCheck,
      doingWell: !reasons.length && (week > 0 || (lastPct !== null && lastPct >= LOW_SCORE)),
      good,
      missed,
      lastPct,
      lowRecent,
      absent,
      missingHomework,
      recordings: recs,
      lastHere,
      isNew: nowMs - joinedMs(s) < ATTENTION.newDays * DAY && !lastChecked,
      hadClass: (inClass.get(s.id) ?? 0) >= joinedMs(s),
      next,
    };
  });

  // Away with a reason: off every list until the day after.
  const awayNow = rows.filter((r) => (awayUntil.get(r.student.id) ?? "") >= today);
  const awayIds = new Set(awayNow.map((r) => r.student.id));
  // Done (or a message sent from Today) hides a student for a week, unless something heavier happened since.
  const visible = rows.filter((r) => !awayIds.has(r.student.id) && (r.newSinceCheck || !(r.lastChecked && nowMs - r.lastChecked < ATTENTION.hideDays * DAY)));
  const sinceCheck = (r: AttentionRow) => (r.daysSinceCheck === null ? Infinity : r.daysSinceCheck);
  const byName = (a: AttentionRow, b: AttentionRow) => a.student.username.localeCompare(b.student.username);
  const heaviest = (a: AttentionRow, b: AttentionRow) =>
    Number(b.newSinceCheck) - Number(a.newSinceCheck) || b.score - a.score || b.reasons.length - a.reasons.length || sinceCheck(b) - sinceCheck(a) || byName(a, b);
  const newcomers = visible.filter((r) => r.isNew).sort((a, b) => joinedMs(b.student) - joinedMs(a.student) || byName(a, b));
  const settledRows = visible.filter((r) => !r.isNew);
  const problems = settledRows.filter((r) => r.reasons.length > 0 && r.score >= NEEDS_YOU).sort(heaviest);
  const minor = settledRows.filter((r) => r.reasons.length > 0 && r.score < NEEDS_YOU).sort(heaviest);
  const rotation = settledRows
    .filter((r) => !r.reasons.length && (r.daysSinceCheck === null || r.daysSinceCheck > ATTENTION.rotationDays))
    .map((r) => ({ ...r, rotation: true }))
    .sort((a, b) => sinceCheck(b) - sinceCheck(a) || byName(a, b));

  // Since you messaged: students who were already away when Hamza got in touch
  // in the last week, and whether there has been any sign of them since.
  let followUp: AttentionResult["followUp"] = null;
  if (activity) {
    const cameBack: Student[] = [];
    const stillAway: Student[] = [];
    for (const s of students) {
      const c = contact.get(s.id);
      const at = Math.max(c?.student ?? 0, c?.parent ?? 0);
      if (!at || nowMs - at > ATTENTION.followDays * DAY) continue;
      const before = lastBefore(s.id, at);
      if (before && at - before < ATTENTION.signinDays * DAY) continue;
      if (hereAfter(s.id, at)) cameBack.push(s);
      else if (nowMs - at >= DAY) stillAway.push(s);
    }
    followUp = { cameBack, stillAway };
  }

  return {
    problems,
    minor,
    rotation,
    newcomers,
    away: awayNow.map((r) => ({ student: r.student, until: awayUntil.get(r.student.id)! })).sort((a, b) => a.until.localeCompare(b.until)),
    followUp,
    all: rows,
  };
}
