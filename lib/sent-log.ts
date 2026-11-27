import type { Database } from "@/lib/data/seed";
import { pkDate } from "@/lib/timetable";

/**
 * What Hamza has sent each student and parent, read from the reminder log
 * (reminders_sent: kind is free text, so no database change). Used for the
 * "Last sent" line and History on Today and Tell parents, for the rule that
 * only the first two messages to a person introduce Hamza, and for "Stop
 * automatic reminders".
 *
 * One tap often writes several rows at once (Today's Parent button writes
 * "checked", "contact_parent" and "msg_parent"), so rows for the same person
 * within five seconds of each other are one entry. Only msg_* rows and report
 * sends are messages; contact_* and a Tell parents "Done" are marks.
 */

export type Audience = "parent" | "student";

/** A pre-written WhatsApp opened from the console. ref: `${what}:${YYYY-MM-DD}`. */
export const MSG_PARENT = "msg_parent";
export const MSG_STUDENT = "msg_student";
/** Automatic phone reminders that chase a student are off until this day (ref: YYYY-MM-DD). */
export const MUTE_AUTO = "mute_auto";
/** A Tell parents reminder passed over without sending: `skip:<kind>`, same ref. Never a message. */
export const SKIP_PREFIX = "skip:";
/** How long "Stop automatic reminders" lasts unless Hamza turns them back on. */
export const MUTE_DAYS = 14;

/** A pre-written WhatsApp really opened: the only rows that count as messages (with report sends). */
const MSG_KINDS: Record<string, Audience> = { [MSG_PARENT]: "parent", [MSG_STUDENT]: "student" };
/** Marks with no message of their own (Today's Done menu, Call, Tell parents' Done): shown, never counted. */
const MARKS: Record<string, { audience: Audience; label: string }> = {
  contact_parent: { audience: "parent", label: "Marked: parent knows" },
  contact_student: { audience: "student", label: "Marked: spoke to them" },
  absent_streak: { audience: "parent", label: "Marked done: absence note" },
  missed_test: { audience: "parent", label: "Marked done: missed test note" },
  low_score: { audience: "parent", label: "Marked done: low result note" },
  report_due: { audience: "parent", label: "Marked done: monthly report" },
};
/** Rows written by one tap land within this of each other; only those are one entry (and one Undo). */
const SAME_TAP_MS = 5_000;

/** What a message was about, in plain words (the `what` in a msg_* ref). */
const WHAT: Record<string, string> = {
  absence: "absence note",
  absent_streak: "absence note",
  missed_test: "missed test note",
  low_score: "low result note",
  report: "monthly report",
  report_due: "monthly report",
  update: "update",
  check_in: "check in",
  welcome: "welcome",
  first_class: "first class check in",
  homework_missing: "homework note",
  missed_class: "missed class note",
  class_started: "class started reminder",
  test_closing: "test closing reminder",
  homework_due: "homework reminder",
  reopened: "test reopened note",
  notifications: "how to turn on reminders",
  login: "login details",
};

/** The msg_* `what` for each Tell parents kind, so its Send is logged as a message. */
export const REMINDER_WHAT: Record<string, string> = { absent_streak: "absence", missed_test: "missed_test", low_score: "low_score", report_due: "report" };

export interface SentEntry {
  at: number;
  audience: Audience;
  /** "absence note to parent", or "Marked: parent knows". */
  label: string;
  /** A real message (counts for the first-two rule and "Last sent"); false for a mark. */
  message: boolean;
  /** The log rows behind it (what Undo deletes). */
  rows: Array<{ kind: string; ref: string }>;
  /** False for a monthly report (the report itself is recorded). */
  undoable: boolean;
  /** A Tell parents reminder Hamza skipped: shown in History, never counted as a message. */
  skipped?: boolean;
}

// The log grouped by student once per load (Today and Tell parents ask for every student).
const grouped = new WeakMap<Database["remindersSent"], Map<string, Database["remindersSent"]>>();
function byStudent(list: Database["remindersSent"]) {
  let m = grouped.get(list);
  if (m) return m;
  m = new Map();
  for (const r of list) {
    const l = m.get(r.studentId);
    if (l) l.push(r);
    else m.set(r.studentId, [r]);
  }
  grouped.set(list, m);
  return m;
}

/** Everything sent to this student or their parent, and the marks, newest first, one entry per tap. Skips included, flagged. */
export function sentHistory(db: Pick<Database, "remindersSent" | "reports">, studentId: string): SentEntry[] {
  type R = { kind: string; ref: string; at: number; audience: Audience };
  const rows: R[] = [];
  const checked: Array<{ ref: string; at: number }> = [];
  const skips: SentEntry[] = [];
  for (const r of byStudent(db.remindersSent).get(studentId) ?? []) {
    const at = +new Date(r.sentAt);
    if (!Number.isFinite(at)) continue;
    if (r.kind === "checked") checked.push({ ref: r.ref, at });
    else if (r.kind.startsWith(SKIP_PREFIX)) {
      const kind = r.kind.slice(SKIP_PREFIX.length);
      skips.push({ at, audience: "parent", label: `Skipped: ${WHAT[kind] ?? "reminder"}`, message: false, rows: [{ kind: r.kind, ref: r.ref }], undoable: true, skipped: true });
    } else {
      const audience = MSG_KINDS[r.kind] ?? MARKS[r.kind]?.audience;
      if (audience) rows.push({ kind: r.kind, ref: r.ref, at, audience });
    }
  }
  // Reports are recorded on the report itself; one also logged as a message moments apart is the same send.
  const reportMsgs = rows.filter((x) => x.kind === MSG_PARENT && x.ref.startsWith("report:")).map((x) => x.at);
  for (const rep of db.reports) {
    if (rep.studentId !== studentId || !rep.sentAt) continue;
    const at = +new Date(rep.sentAt);
    if (Number.isFinite(at) && !reportMsgs.some((t) => Math.abs(t - at) <= 10 * 60_000)) rows.push({ kind: "report", ref: rep.month, at, audience: "parent" });
  }
  rows.sort((a, b) => a.at - b.at);
  const out: SentEntry[] = [];
  const open: Partial<Record<Audience, { start: number; end: number; list: R[] }>> = {};
  const close = (aud: Audience) => {
    const c = open[aud];
    if (!c) return;
    const msg = c.list.find((x) => x.kind === MSG_PARENT || x.kind === MSG_STUDENT || x.kind === "report");
    const extra = checked.filter((x) => x.at >= c.start - SAME_TAP_MS && x.at <= c.end + SAME_TAP_MS).map((x) => ({ kind: "checked", ref: x.ref }));
    out.push({
      at: c.end,
      audience: aud,
      label: msg ? `${msg.kind === "report" ? WHAT.report : (WHAT[msg.ref.split(":")[0]] ?? "message")} to ${aud}` : (MARKS[c.list[0].kind]?.label ?? "Marked"),
      message: !!msg,
      rows: [...c.list.filter((x) => x.kind !== "report").map((x) => ({ kind: x.kind, ref: x.ref })), ...extra],
      undoable: !c.list.some((x) => x.kind === "report" || x.kind === "report_due" || (x.kind === MSG_PARENT && x.ref.startsWith("report:"))),
    });
    delete open[aud];
  };
  for (const r of rows) {
    const c = open[r.audience];
    if (c && r.at - c.end <= SAME_TAP_MS) {
      c.list.push(r);
      c.end = r.at;
      continue;
    }
    close(r.audience);
    open[r.audience] = { start: r.at, end: r.at, list: [r] };
  }
  close("parent");
  close("student");
  return [...out, ...skips].sort((a, b) => b.at - a.at);
}

/** The newest real message (marks and skips aside), or null. */
export const lastSent = (db: Pick<Database, "remindersSent" | "reports">, studentId: string) => sentHistory(db, studentId).find((e) => e.message) ?? null;

/** How many real messages have gone to this person (pre-written WhatsApps opened, reports sent). */
export function sentCount(db: Pick<Database, "remindersSent" | "reports">, studentId: string, audience: Audience): number {
  return sentHistory(db, studentId).filter((e) => e.message && e.audience === audience).length;
}

/**
 * True while fewer than two messages have gone to this person: Hamza says who
 * he is in the first two, then writes like a normal text.
 */
export function introNeeded(db: Pick<Database, "remindersSent" | "reports">, studentId: string, audience: Audience): boolean {
  return sentCount(db, studentId, audience) < 2;
}

/** Automatic reminders are off for this student until this day (YYYY-MM-DD), or null. */
export function mutedUntil(db: Pick<Database, "remindersSent">, studentId: string, today: string): string | null {
  let best: string | null = null;
  for (const r of byStudent(db.remindersSent).get(studentId) ?? [])
    if (r.kind === MUTE_AUTO && /^\d{4}-\d{2}-\d{2}$/.test(r.ref) && r.ref >= today && (!best || r.ref > best)) best = r.ref;
  return best;
}

/**
 * Log a pre-written WhatsApp when its button is pressed, so History and
 * the first-two rule know about it. `what` is a key of WHAT above.
 */
export function logMessage(store: { markReminderSent(studentId: string, kind: string, ref: string): void }, studentId: string, audience: Audience, what: string) {
  const ref = `${what}:${pkDate(Date.now())}`;
  // Next task, after the browser has followed the link: logging at once re-renders the page,
  // and a message link drawn again with the new count could lose its introduction first.
  setTimeout(() => store.markReminderSent(studentId, audience === "parent" ? MSG_PARENT : MSG_STUDENT, ref), 0);
}

/** "Tue 18 Nov" in Pakistan time. */
export const sentDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });

/** Plain names for the automatic phone reminders (notify_log kinds and refs). */
export function phoneLabel(kind: string, ref: string): string {
  switch (kind) {
    case "classes":
      return ref.startsWith("start:") ? "Phone: class starting" : "Phone: class change";
    case "tests":
      return "Phone: test opening";
    case "assignments":
      return ref.startsWith("due:") ? "Phone: homework due" : "Phone: new homework";
    case "results":
      return "Phone: result out";
    case "study":
      return "Phone: study time";
    case "recordings":
      return "Phone: recording closing";
    case "news":
      return "Phone: announcement";
    case "nudge":
      return "Phone: come back nudge";
    default:
      return "Phone: reminder";
  }
}
