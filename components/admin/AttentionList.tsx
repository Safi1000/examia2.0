"use client";

import Link from "next/link";
import { useState } from "react";
import type { AttentionRow } from "@/lib/attention";
import { LOW_SCORE } from "@/lib/reminders";
import { displayName } from "@/lib/display-name";
import {
  parentUpdate,
  studentAbsent,
  studentCheckIn,
  studentHomeworkMissing,
  studentLowScore,
  studentMissedClass,
  studentMissedTest,
} from "@/lib/portal-messages";
import { useTeacherNotes } from "@/lib/teacher-notes";
import { NoteEditor, NOTE_LABEL } from "@/components/admin/StudentNote";
import { useToast } from "@/components/toast";
import { Badge, Card } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { panelTitle } from "@/components/admin/surface";

const SHOW = 8;
const waTo = (e164: string | undefined, text: string) =>
  e164 ? `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const weekday = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", timeZone: "Asia/Karachi" });

/** What "Message" says, by the heaviest reason. Never mentions what the portal tracks. */
function studentMessage(r: AttentionRow, nowMs: number) {
  const w = { id: r.student.id, username: r.student.username };
  if (r.missed.length) return studentMissedTest({ ...w, title: r.missed[0].title });
  if (r.lastPct !== null && r.lastPct < LOW_SCORE) return studentLowScore(w);
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

/**
 * Today's one list of students who need Hamza: real problems first (heaviest
 * first), then everyone not spoken to for two weeks, longest first, so every
 * student comes round. Message, Parent and Done all hide the student for a week.
 */
export function AttentionList({
  problems,
  rotation,
  studentCount,
  nowMs,
  loadingMore,
  onCheck,
}: {
  problems: AttentionRow[];
  rotation: AttentionRow[];
  studentCount: number;
  nowMs: number;
  /** Groundwork, activity or recordings still loading: a few reasons may still appear. */
  loadingMore: boolean;
  onCheck: (studentId: string) => void;
}) {
  const { toast } = useToast();
  const { notes, loaded: notesLoaded } = useTeacherNotes();
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const rows = [...problems, ...rotation];
  const shown = showAll ? rows : rows.slice(0, SHOW);

  const check = (e: React.MouseEvent<HTMLElement>) => {
    const id = e.currentTarget.dataset.id;
    if (id) onCheck(id);
  };
  const toggleNote = (e: React.MouseEvent<HTMLElement>) => {
    const id = e.currentTarget.dataset.id ?? null;
    setEditing((cur) => (cur === id ? null : id));
  };
  const closeNote = (saved: boolean) => {
    setEditing(null);
    if (saved) toast("Note saved", "success");
  };

  return (
    <Card id="attention" className="min-w-0 scroll-mt-24 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={panelTitle}>Students who need you today</h2>
        {studentCount > 0 && (
          <span className="text-sm tabular-nums text-ink-3">
            {rows.length} of {studentCount} students
          </span>
        )}
      </div>
      {loadingMore && rows.length > 0 && <p className="mt-1 text-xs text-ink-3">Still checking Groundwork, recordings and sign-ins.</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-2">
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
        <ul className="mt-3 divide-y divide-border">
          {shown.map((r, i) => {
            const s = r.student;
            const studentLink = waTo(s.phone, studentMessage(r, nowMs));
            const parentLink = waTo(s.whatsapp, parentMessage(r));
            const note = notes[s.id]?.text;
            const firstRotation = r.rotation && (i === 0 || !shown[i - 1].rotation);
            return (
              <li key={s.id} className={cn("py-3.5", firstRotation && i > 0 && "border-t-border-strong")}>
                {firstRotation && <p className="mb-2 text-[13px] font-semibold text-ink-3">Not spoken to lately</p>}
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
                  <div className="min-w-0 flex-1 basis-64">
                    <Link href={`/admin/roster/${s.id}`} className="font-semibold text-ink underline-offset-4 hover:underline">
                      {displayName(s.username)}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.reasons.map((x) => (
                        <Badge key={x.label}>{x.label}</Badge>
                      ))}
                      {r.rotation && <Badge>{r.daysSinceCheck === null ? "Not spoken to yet" : `Not spoken to in ${r.daysSinceCheck} days`}</Badge>}
                      {r.rotation && r.doingWell && <Badge tone="success">Doing well</Badge>}
                    </div>
                    {r.good && <p className="mt-1.5 text-sm text-ink-2">{r.good}</p>}
                    <p className="mt-1 truncate text-[13px] text-ink-3">
                      {r.lastChecked ? `Last checked in ${shortDate(r.lastChecked)}` : "Not checked in yet"}
                      {note && <span title={note}> · Note: {note}</span>}
                    </p>
                  </div>
                  {/* Quiet buttons on every row: gold stays for the page's one main action. */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {studentLink && (
                      <a href={studentLink} target="_blank" rel="noopener noreferrer" data-id={s.id} onClick={check} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                        Message
                      </a>
                    )}
                    {parentLink && (
                      <a
                        href={parentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-id={s.id}
                        onClick={check}
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                      >
                        Parent
                      </a>
                    )}
                    {!studentLink && !parentLink && (
                      <Link href={`/admin/roster/${s.id}`} className="inline-flex min-h-11 items-center px-1 text-sm text-ink-3 transition-colors hover:text-ink">
                        Add a number
                      </Link>
                    )}
                    <button type="button" data-id={s.id} onClick={check} className={buttonClasses({ variant: "secondary", size: "sm" })} title="Hide for a week">
                      Done
                    </button>
                    {notesLoaded && (
                      <button
                        type="button"
                        data-id={s.id}
                        onClick={toggleNote}
                        aria-expanded={editing === s.id}
                        className={buttonClasses({ variant: "ghost", size: "sm" })}
                        aria-label={`${note ? "Edit" : "Add"} private note for ${displayName(s.username)}`}
                      >
                        Note
                      </button>
                    )}
                  </div>
                </div>
                {editing === s.id && (
                  <div className="mt-3 max-w-xl">
                    <p className="mb-1.5 text-[13px] font-semibold text-ink-3">{NOTE_LABEL}</p>
                    <NoteEditor studentId={s.id} onDone={closeNote} autoFocus />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!showAll && rows.length > SHOW && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-2 min-h-11 text-sm font-semibold text-ink-2 hover:text-ink">
          Show all ({rows.length})
        </button>
      )}
    </Card>
  );
}
