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
import { eligibleStudents, joinedMs, testById } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { currentStats } from "@/lib/focus";
import { LOW_SCORE } from "@/lib/reminders";
import { clean, count, joinAnd } from "@/lib/outgoing-message";

/** `missed "A" and "B"` when every title is there, else `missed 2 tests` / `missed a test`. For the parent message. */
function namedOrCounted(verb: string, titles: string[], one: string, many: string) {
  const named = titles.map(clean).filter(Boolean);
  if (named.length && named.length === titles.length) return `${verb} ${joinAnd(named.map((t) => `"${t}"`))}`;
  return `${verb} ${titles.length > 1 ? count(titles.length, one, many) : one}`;
}

const DAY = 86_400_000;

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
    db.attendanceDays.filter((a) => a.status !== "absent" && a.date >= from && a.date <= to).map((a) => `${a.studentId}|${a.classId ?? ""}|${a.date}`),
  );
  const watched = new Map(students.map((s) => [s.id, new Set(profiles[s.id]?.watched ?? [])]));

  const out: SlotRecording[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const slots = liveSlotsOn(db, d).filter((s) => s.endMs <= nowMs && linkBy.has(slotKey(s)));
    if (!slots.length) continue;
    const enrolledBy = new Map<string, Student[]>();
    for (const st of students) for (const sl of slotsForStudent(db, st, d)) enrolledBy.set(slotKey(sl), [...(enrolledBy.get(slotKey(sl)) ?? []), st]);
    // Latest class of the day first.
    for (const slot of [...slots].reverse()) {
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
 * How serious each reason is. A row's score is the sum of its reasons, so
 * more reasons and heavier reasons come first.
 */
export const REASON_WEIGHT: Record<ReasonKind, number> = {
  missed_test: 3,
  absent_streak: 3,
  low_score: 2,
  homework_missing: 2,
  recording: 2,
  signin: 2,
  homework_late: 1,
  groundwork: 1,
};

export interface Reason {
  kind: ReasonKind;
  /** The chip Hamza sees. */
  label: string;
  /**
   * The same fact in words fit for a parent, or null when it would reveal what the portal tracks.
   * Written to follow the student's name in a sentence ("Amelia missed ..."), lower case, no full stop.
   */
  parent: string | null;
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
  doingWell: boolean;
  /** One line of good news, or null. */
  good: string | null;
  missed: Test[];
  lastPct: number | null;
  absent: number;
  missingHomework: Assignment[];
  recordings: SlotRecording[];
}

/** Thresholds, in one place so they are easy to change. */
export const ATTENTION = {
  testDays: 14,
  homeworkDays: 14,
  recordingDays: 7,
  groundworkDays: 6,
  signinDays: 7,
  rotationDays: 14,
  hideDays: 7,
} as const;

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
  },
): { problems: AttentionRow[]; rotation: AttentionRow[] } {
  const { students, tests, nowMs, checked, profiles, profilesReady, activity, recordings } = opts;
  const today = pkDate(nowMs);
  const ids = new Set(students.map((s) => s.id));

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

  // Absences in a row, newest first: one pass over the register.
  const register = new Map<string, Array<{ date: string; status: string }>>();
  for (const a of db.attendanceDays) if (ids.has(a.studentId)) register.set(a.studentId, [...(register.get(a.studentId) ?? []), a]);
  const streak = (id: string) => {
    let n = 0;
    for (const d of [...(register.get(id) ?? [])].sort((a, b) => b.date.localeCompare(a.date))) {
      if (d.status !== "absent") break;
      n++;
    }
    return n;
  };

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
    const missed = recent.filter((r) => r.eligible.has(s.id) && !r.done.has(s.id)).map((r) => r.t);
    if (missed.length) {
      const l = `Missed ${missed.map((t) => t.title).join(", ")}`;
      reasons.push({ kind: "missed_test", label: l, parent: namedOrCounted("missed", missed.map((t) => t.title), "a test", "tests") });
    }
    const latest = latestReleased.get(s.id);
    const latestTest = latest ? testById(db, latest.testId) : undefined;
    const lastPct = latest && latestTest ? Math.round(gradeSubmission(latestTest, latest).percent) : null;
    if (lastPct !== null && lastPct < LOW_SCORE) reasons.push({ kind: "low_score", label: `Last test ${lastPct}%`, parent: Number.isFinite(lastPct) ? `got ${lastPct}% in the last test` : "found the last test difficult" });
    const absent = streak(s.id);
    if (absent >= 2) reasons.push({ kind: "absent_streak", label: `Absent ${absent} classes in a row`, parent: `has missed the last ${count(absent, "class", "classes")}` });

    // The same "who it was set for" rule as the Homework page's hand-in list.
    const owed = dueRecently.filter(
      (a) =>
        a.cohortId === s.cohortId &&
        joinedMs(s) < +new Date(a.dueAt) &&
        (!a.classId || s.classIds.includes(a.classId)) &&
        (!a.subjectId || s.subjectIds.includes(a.subjectId)),
    );
    const missingHomework = owed.filter((a) => !handIn.has(`${s.id}|${a.id}`));
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
      reasons.push({ kind: "homework_missing", label: l, parent: p });
    }
    if (late.length) {
      const l = late.length === 1 ? `Homework late: ${late[0].title}` : `${late.length} homeworks handed in late`;
      const one = clean(late[0].title);
      const p = late.length === 1 ? `handed in ${one ? `the homework "${one}"` : "a homework"} late` : `handed in ${count(late.length, "homework")} late`;
      reasons.push({ kind: "homework_late", label: l, parent: p });
    }

    const recs = recMissed.get(s.id) ?? [];
    if (recs.length) {
      const day = (r: SlotRecording) => new Date(r.slot.startMs).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Karachi" });
      reasons.push(
        recs.length === 1
          ? { kind: "recording", label: `Missed ${recs[0].slot.subject} on ${day(recs[0])}, recording not opened`, parent: `missed ${clean(recs[0].slot.subject) ? `the ${clean(recs[0].slot.subject)} class` : "a class"}${clean(day(recs[0])) ? ` on ${clean(day(recs[0]))}` : ""}` }
          : { kind: "recording", label: `Missed ${recs.length} classes, recordings not opened`, parent: `missed ${count(recs.length, "class", "classes")} this week` },
      );
    }

    // Activity: last time they were on the portal (tracking or sign-in). No entry means unknown, so no reason.
    const act = activity?.[s.id];
    if (act) {
      const seen = lastSeen(act);
      if (seen === null) reasons.push({ kind: "signin", label: "Never signed in", parent: null });
      else {
        const days = Math.floor((nowMs - seen) / DAY);
        if (days >= ATTENTION.signinDays) reasons.push({ kind: "signin", label: `Not on the portal for ${days} days`, parent: null });
      }
    }

    const p = profiles[s.id];
    if (gwOn) {
      const last = lastStudyDay(p, today);
      if (last ? last < addDays(today, -(ATTENTION.groundworkDays - 1)) : neverCounts) {
        const ago = last ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / DAY) : null;
        reasons.push({ kind: "groundwork", label: ago === null ? "No Groundwork yet" : `No Groundwork in ${ago} days`, parent: null });
      }
    }

    const lastChecked = checked[s.id] || null;
    const daysSinceCheck = lastChecked ? Math.floor((nowMs - lastChecked) / DAY) : null;
    const week = groundworkWeekMinutes(p, nowMs);
    const goodBits: string[] = [];
    if (week > 0) goodBits.push(`${fmtMinutes(week)} in Groundwork this week`);
    // Focus time on recent homework, from the activity file (absent when there is none). At most 16 h per homework is believed.
    const hwFocus = act?.focusHomework;
    const hwMin = hwFocus ? Math.round(recentHomework.reduce((n, id) => n + Math.min(960 * 60, Math.max(0, Number(hwFocus[id]) || 0)), 0) / 60) : 0;
    if (hwMin > 0) goodBits.push(`${fmtMinutes(hwMin)} focused on recent homework`);
    if (lastPct !== null && lastPct >= 80) goodBits.push(`last test ${lastPct}%`);
    const good = goodBits.length ? goodBits.join(", ").replace(/^./, (c) => c.toUpperCase()) : null;
    const score = reasons.reduce((n, r) => n + REASON_WEIGHT[r.kind], 0);
    return {
      student: s,
      reasons,
      score,
      rotation: false,
      lastChecked,
      daysSinceCheck,
      doingWell: !reasons.length && (week > 0 || (lastPct !== null && lastPct >= LOW_SCORE)),
      good,
      missed,
      lastPct,
      absent,
      missingHomework,
      recordings: recs,
    };
  });

  // Done (or a message sent from Today) hides a student for a week.
  const visible = rows.filter((r) => !(r.lastChecked && nowMs - r.lastChecked < ATTENTION.hideDays * DAY));
  const sinceCheck = (r: AttentionRow) => (r.daysSinceCheck === null ? Infinity : r.daysSinceCheck);
  const byName = (a: AttentionRow, b: AttentionRow) => a.student.username.localeCompare(b.student.username);
  const problems = visible
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length || sinceCheck(b) - sinceCheck(a) || byName(a, b));
  const rotation = visible
    .filter((r) => !r.reasons.length && (r.daysSinceCheck === null || r.daysSinceCheck > ATTENTION.rotationDays))
    .map((r) => ({ ...r, rotation: true }))
    .sort((a, b) => sinceCheck(b) - sinceCheck(a) || byName(a, b));
  return { problems, rotation };
}
