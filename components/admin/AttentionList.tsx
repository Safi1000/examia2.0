"use client";

import Link from "next/link";
import { useState } from "react";
import { AT_RISK, type AttentionResult, type AttentionRow } from "@/lib/attention";
import { displayName } from "@/lib/display-name";
import { pkDate } from "@/lib/timetable";
import {
  parentUpdate,
  studentAbsent,
  studentCheckIn,
  studentFirstClass,
  studentHomeworkMissing,
  studentLowScore,
  studentMissedClass,
  studentMissedTest,
  studentWelcome,
} from "@/lib/portal-messages";
import { useTeacherNotes } from "@/lib/teacher-notes";
import { NoteEditor, NOTE_LABEL } from "@/components/admin/StudentNote";
import { useToast } from "@/components/toast";
import { Badge, Card } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { panelTitle } from "@/components/admin/surface";

/** The top of the list: the few students most worth a message today. The rest wait one tap away. */
const TOP = 5;
/** "Not spoken to lately" shows this many before its own Show all. */
const ROTATION_TOP = 3;

const waTo = (e164: string | undefined, text: string) =>
  e164 ? `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;
const telTo = (e164: string | undefined) => (e164 ? `tel:+${e164.replace(/\D/g, "")}` : null);
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const ymdLabel = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const weekday = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", timeZone: "Asia/Karachi" });
const names = (list: Array<{ username: string }>) => list.map((s) => displayName(s.username) || s.username).join(", ");

/** What "Message" says, by the heaviest reason. Never mentions what the portal tracks. */
function studentMessage(r: AttentionRow, nowMs: number) {
  const w = { id: r.student.id, username: r.student.username };
  if (r.isNew && !r.reasons.length) return r.hadClass ? studentFirstClass(w) : studentWelcome(w);
  if (r.missed.length) return studentMissedTest({ ...w, title: r.missed[0].title });
  if (r.lowRecent) return studentLowScore(w);
  if (r.absent >= 2) return studentAbsent(w);
  if (r.missingHomework.length) return studentHomeworkMissing({ ...w, title: r.missingHomework[0].title });
  const rec = r.recordings.find((x) => x.closesMs > nowMs);
  if (rec) return studentMissedClass({ ...w, subject: rec.slot.subject, day: weekday(rec.slot.startMs) });
  return studentCheckIn(w);
}

/** To the parent: only facts a parent can see for themselves (never Groundwork, sign-ins or recordings opened). */
function parentMessage(r: AttentionRow) {
  const facts = r.reasons.map((x) => x.parent).filter((x): x is string => !!x);
  return parentUpdate({ id: r.student.id, username: r.student.username, facts });
}

/** What Today records for each button. */
export type AttentionAct = { kind: "student" | "parent" | "spoke" | "parent_knows" } | { kind: "away"; until: string };

/**
 * Today's list of students who need Hamza, kept short on purpose: new students
 * to welcome, then the five heaviest real risks, with smaller things and the
 * rest one tap away, then a few not spoken to lately. Each row suggests one
 * next step (the student, then the parent, then a call). Message, Parent and
 * Done hide a student for a week, unless something heavier happens.
 */
export function AttentionList({
  data,
  studentCount,
  nowMs,
  loadingMore,
  pushOn,
  onAct,
}: {
  data: Pick<AttentionResult, "problems" | "minor" | "rotation" | "newcomers" | "away" | "followUp">;
  studentCount: number;
  nowMs: number;
  /** Groundwork, activity or recordings still loading: a few reasons may still appear. */
  loadingMore: boolean;
  /** Students with phone reminders on (null: unknown, so no row is marked). */
  pushOn: Set<string> | null;
  onAct: (studentId: string, act: AttentionAct) => void;
}) {
  const { problems, minor, rotation, newcomers, away, followUp } = data;
  const { toast } = useToast();
  const { notes, loaded: notesLoaded } = useTeacherNotes();
  const [showRest, setShowRest] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const today = pkDate(nowMs);
  const [awayDate, setAwayDate] = useState("");

  const top = problems.slice(0, TOP);
  const rest = [...problems.slice(TOP), ...minor];
  const rot = showRotation ? rotation : rotation.slice(0, ROTATION_TOP);
  const nothing = !newcomers.length && !problems.length && !minor.length && !rotation.length;

  const closeNote = (saved: boolean) => {
    setEditing(null);
    if (saved) toast("Note saved", "success");
  };
  const act = (id: string, a: AttentionAct) => {
    onAct(id, a);
    setDoneFor(null);
  };

  const row = (r: AttentionRow) => {
    const s = r.student;
    const name = displayName(s.username) || s.username;
    const studentLink = waTo(s.phone, studentMessage(r, nowMs));
    const parentLink = waTo(s.whatsapp, parentMessage(r));
    const callLink = telTo(s.whatsapp);
    const note = notes[s.id]?.text;
    // The suggested next step leads (outlined); the others stay quiet beside it.
    const step = r.next.step === "student" && !studentLink ? "parent" : r.next.step;
    const lead = (k: "student" | "parent" | "call") => buttonClasses({ variant: step === k ? "secondary" : "ghost", size: "sm" });
    const ladder =
      r.next.since && r.next.step === "parent"
        ? `Messaged ${name} on ${shortDate(r.next.since)}, no change since. The parent is next.`
        : r.next.since && r.next.step === "call"
          ? `Messaged the parent on ${shortDate(r.next.since)}, no change since. Time for a call.`
          : null;
    const options: Array<{ k: "student" | "parent" | "call"; href: string | null; label: string; external: boolean }> = [
      { k: "student", href: studentLink, label: "Message", external: true },
      { k: "parent", href: parentLink, label: "Parent", external: true },
      { k: "call", href: step === "call" ? callLink : null, label: "Call parent", external: false },
    ];
    // The suggested step first, then the usual order.
    const buttons = options
      .filter((o) => o.href)
      .sort((a, b) => Number(b.k === step) - Number(a.k === step))
      .map((o) => (
        <a
          key={o.k}
          href={o.href!}
          {...(o.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          onClick={() => onAct(s.id, { kind: o.k === "student" ? "student" : "parent" })}
          className={lead(o.k)}
        >
          {o.label}
        </a>
      ));
    return (
      <li key={s.id} className="py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
          <div className="min-w-0 flex-1 basis-64">
            <Link href={`/admin/roster/${s.id}`} className="text-base font-semibold text-ink underline-offset-4 hover:underline">
              {name}
            </Link>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.newSinceCheck && <Badge tone="warning">New since you checked</Badge>}
              {r.score >= AT_RISK && <Badge tone="error">At risk of leaving</Badge>}
              {r.isNew && <Badge tone="brand">Joined {shortDate(Date.parse(s.createdAt))}</Badge>}
              {r.reasons.map((x) => (
                <Badge key={x.label}>{x.label}</Badge>
              ))}
              {r.rotation && <Badge>{r.daysSinceCheck === null ? "Not spoken to yet" : `Not spoken to in ${r.daysSinceCheck} days`}</Badge>}
              {r.rotation && r.doingWell && <Badge tone="success">Doing well</Badge>}
              {/* The automatic nudges can't reach them: a WhatsApp from you is the only one they'll get. */}
              {pushOn && !pushOn.has(s.id) && <Badge>No phone reminders</Badge>}
            </div>
            {r.good && <p className="mt-1.5 text-sm text-ink-2">{r.good}</p>}
            {ladder && <p className="mt-1.5 text-sm text-ink-2">{ladder}</p>}
            <p className="mt-1 truncate text-sm text-ink-3">
              {r.lastChecked ? `Last checked in ${shortDate(r.lastChecked)}` : "Not checked in yet"}
              {note && <span title={note}> · Note: {note}</span>}
            </p>
          </div>
          {/* Quiet buttons on every row: gold stays for the page's one main action. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {buttons}
            {!studentLink && !parentLink && (
              // Opens the student's details form, where the parent's WhatsApp number goes.
              <Link href={`/admin/roster?edit=${s.id}`} className="inline-flex min-h-11 items-center px-1 text-sm text-ink-3 transition-colors hover:text-ink">
                Add parent&apos;s number
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setDoneFor((cur) => (cur === s.id ? null : s.id));
                setAwayDate("");
              }}
              aria-expanded={doneFor === s.id}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              Done
            </button>
            {notesLoaded && (
              <button
                type="button"
                onClick={() => setEditing((cur) => (cur === s.id ? null : s.id))}
                aria-expanded={editing === s.id}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
                aria-label={`${note ? "Edit" : "Add"} private note for ${name}`}
              >
                Note
              </button>
            )}
          </div>
        </div>
        {doneFor === s.id && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-field bg-surface-2/40 p-3">
            <button type="button" onClick={() => act(s.id, { kind: "spoke" })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Spoke to them
            </button>
            <button type="button" onClick={() => act(s.id, { kind: "parent_knows" })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Parent knows
            </button>
            <span className="inline-flex flex-wrap items-center gap-2">
              <label htmlFor={`away-${s.id}`} className="text-sm text-ink-2">
                Away until
              </label>
              <input
                id={`away-${s.id}`}
                type="date"
                min={today}
                value={awayDate}
                onChange={(e) => setAwayDate(e.target.value)}
                className="h-10 rounded-field border border-border-strong bg-transparent px-3 text-sm text-ink pointer-coarse:h-11"
              />
              <button
                type="button"
                disabled={!/^\d{4}-\d{2}-\d{2}$/.test(awayDate) || awayDate < today}
                onClick={() => act(s.id, { kind: "away", until: awayDate })}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Save
              </button>
            </span>
            <p className="w-full text-sm text-ink-3">Spoke to them and Parent knows hide {name} for a week. Away keeps them off this list, the parent reminders and the automatic nudge until that day.</p>
          </div>
        )}
        {editing === s.id && (
          <div className="mt-3 max-w-xl">
            <p className="mb-1.5 label-quiet text-ink-3">{NOTE_LABEL}</p>
            <NoteEditor studentId={s.id} onDone={closeNote} autoFocus />
          </div>
        )}
      </li>
    );
  };

  const section = (label: string) => <p className="label-quiet mt-4 border-t border-border-strong pt-3 text-ink-3 first:mt-2 first:border-t-0 first:pt-0">{label}</p>;

  return (
    <Card id="attention" className="min-w-0 scroll-mt-24 p-5 sm:p-6 lg:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={panelTitle}>Students who need you today</h2>
        {studentCount > 0 && problems.length > 0 && (
          <span className="text-sm tabular-nums text-ink-3">
            {problems.length} to check on, of {studentCount} students
          </span>
        )}
      </div>
      {loadingMore && !nothing && <p className="mt-1 text-sm text-ink-3">Still checking Groundwork, recordings and portal visits.</p>}
      {followUp && (followUp.cameBack.length > 0 || followUp.stillAway.length > 0) && (
        <p className="mt-2 text-sm text-ink-2">
          <span className="text-ink-3">Since you messaged, last 7 days: </span>
          {followUp.cameBack.length > 0 && <>Came back: <span className="font-semibold text-ink">{names(followUp.cameBack)}</span>. </>}
          {followUp.stillAway.length > 0 && <>Still away: <span className="font-semibold text-ink">{names(followUp.stillAway)}</span>.</>}
        </p>
      )}
      {nothing ? (
        <p className="mt-2 text-base text-ink-2">
          {studentCount === 0 ? (
            <>
              No students here yet. Add them in{" "}
              <Link href="/admin/roster" className="font-semibold text-ink underline underline-offset-4">Roster</Link>.
            </>
          ) : (
            "Everyone is on track, and you've checked in with everyone lately."
          )}
        </p>
      ) : (
        <div className="mt-3">
          {newcomers.length > 0 && (
            <>
              {section("New this week: say hello")}
              <ul className="divide-y divide-hairline">
                {newcomers.map((r) => (
                  row(r)
                ))}
              </ul>
            </>
          )}
          {(top.length > 0 || newcomers.length > 0) && section("Needs you")}
          {top.length === 0 ? (
            <p className="py-2 text-base text-ink-2">Nobody looks like they are drifting right now.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {top.map((r) => (
                row(r)
              ))}
            </ul>
          )}
          {rest.length > 0 &&
            (showRest ? (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {rest.map((r) => (
                  row(r)
                ))}
              </ul>
            ) : (
              <button type="button" onClick={() => setShowRest(true)} className="mt-1 min-h-11 text-sm font-semibold text-ink-2 hover:text-ink">
                {rest.length} more with smaller things
              </button>
            ))}
          {rotation.length > 0 && (
            <>
              {section("Not spoken to lately")}
              <ul className="divide-y divide-hairline">
                {rot.map((r) => (
                  row(r)
                ))}
              </ul>
              {!showRotation && rotation.length > ROTATION_TOP && (
                <button type="button" onClick={() => setShowRotation(true)} className="mt-1 min-h-11 text-sm font-semibold text-ink-2 hover:text-ink">
                  Show all {rotation.length}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {away.length > 0 && (
        <p className="mt-3 border-t border-hairline pt-3 text-sm text-ink-3">
          Away for now: {away.map((a) => `${displayName(a.student.username) || a.student.username} until ${ymdLabel(a.until)}`).join(", ")}.
        </p>
      )}
    </Card>
  );
}
