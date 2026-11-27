"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useDatabase } from "@/lib/data/store";
import { cohortById, homeworkSetFor, testById } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { useToast } from "@/components/toast";
import { Badge, CohortDot, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { RowMenu, type RowMenuItem } from "@/components/admin/RowMenu";
import { copyText } from "@/components/admin/BulkBar";
import { displayName } from "@/lib/display-name";
import { isInPersonStudent } from "@/lib/in-person";
import { waDigits } from "@/lib/phone";
import { cld } from "@/lib/cld";
import { addDays, pkDate, useClassLinks } from "@/lib/classes";
import { subjectAttendance, subjectSummary } from "@/lib/subject-attendance";
import { useActivity } from "@/lib/activity-admin";
import { lastSeen } from "@/lib/activity";
import { formatDate, formatTimestamp } from "@/lib/time";
import { useNow } from "@/hooks/useNow";
import { leftLabel, reasonLabel, type AccessState } from "@/lib/paused";
import { pct, studentFigures } from "@/components/admin/student-figures";

/**
 * A student at a glance, opened by tapping a roster row: a panel on the right
 * on a laptop, a sheet from the bottom on a phone. Esc closes it; the up and
 * down arrows move to the next student in the list. Staff see the same
 * figures as on the student's own page, without numbers, last seen or actions.
 */
export function StudentQuickLook({
  studentId,
  order,
  onMove,
  onClose,
  staff,
  access,
  actions,
}: {
  studentId: string | null;
  /** The ids in the order the list shows them, for the arrow keys. */
  order: string[];
  onMove: (id: string) => void;
  onClose: () => void;
  staff: boolean;
  access: AccessState;
  /** Hamza only. */
  actions?: {
    edit: (s: Student) => void;
    pause: (s: Student) => void;
    resume: (s: Student) => void;
    leave: (s: Student) => void;
    bringBack: (s: Student) => void;
    farewell: (s: Student) => void;
  };
}) {
  const db = useDatabase();
  const student = studentId ? db.students.find((s) => s.id === studentId) : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const open = !!student;

  // Keep the latest callbacks without re-running the key listener on each render.
  const live = useRef({ order, onMove, onClose, studentId });
  useEffect(() => {
    live.current = { order, onMove, onClose, studentId };
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // A dialog opened over the sheet answers its own keys.
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return;
      const { order: ids, onMove: move, onClose: close, studentId: at } = live.current;
      if (e.key === "Escape") {
        // An open More menu takes Escape for itself.
        if (!e.defaultPrevented && !document.querySelector('[role="menu"]')) close();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[role=menu]") || t.isContentEditable)) return;
      const i = at ? ids.indexOf(at) : -1;
      const next = ids[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      move(next);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!student || typeof document === "undefined") return null;
  const i = order.indexOf(student.id);
  const prev = i > 0 ? order[i - 1] : null;
  const next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  const name = displayName(student.username);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end" role="dialog" aria-modal="true" aria-label={`${name} at a glance`}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-[var(--shadow-lg)] outline-none max-sm:animate-sheet-up sm:h-dvh sm:max-h-none sm:w-[26rem] sm:animate-fade-in sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <Body student={student} db={db} staff={staff} access={access} actions={actions} prev={prev} next={next} onMove={onMove} onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

function Body({
  student: s,
  db,
  staff,
  access,
  actions,
  prev,
  next,
  onMove,
  onClose,
}: {
  student: Student;
  db: Database;
  staff: boolean;
  access: AccessState;
  actions?: Parameters<typeof StudentQuickLook>[0]["actions"];
  prev: string | null;
  next: string | null;
  onMove: (id: string) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const nowMs = useNow();
  const name = displayName(s.username);
  const cohort = cohortById(db, s.cohortId);
  const inPerson = isInPersonStudent(db, s);
  const left = access.left[s.id];
  const paused = access.paused.has(s.id);
  const fig = useMemo(() => studentFigures(db, [s], nowMs).get(s.id), [db, s, nowMs]);
  const levels = s.classIds.map((c) => db.classes.find((x) => x.id === c)?.name).filter(Boolean).join(", ");
  const subjects = s.subjectIds.map((x) => db.subjects.find((y) => y.id === x)?.name).filter(Boolean).join(", ");

  // Owed homework, newest deadline first: the same rule as the figures and the student page.
  const owed = useMemo(() => {
    const handIns = new Set(db.assignmentSubmissions.filter((x) => x.studentId === s.id).map((x) => x.assignmentId));
    return db.assignments
      .filter((a) => !handIns.has(a.id) && +new Date(a.dueAt) <= nowMs && homeworkSetFor(db, s, a))
      .sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  }, [db, s, nowMs]);
  const owedShown = owed.slice(0, 3);

  const results = useMemo(
    () =>
      db.submissions
        .filter((x) => x.studentId === s.id && x.status === "released")
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
        .slice(0, 3)
        .map((x) => {
          const t = testById(db, x.testId);
          return { id: x.id, title: t?.title ?? "Deleted test", at: x.submittedAt, percent: t ? Math.round(gradeSubmission(t, x).percent) : null };
        }),
    [db, s.id],
  );

  const status = left ? (
    <Badge tone="neutral">Left · {leftLabel(left.kind).toLowerCase()} · {formatDate(left.at)}</Badge>
  ) : paused ? (
    <Badge tone="warning">Paused{access.reasons[s.id] ? ` · ${reasonLabel(access.reasons[s.id])}` : ""}</Badge>
  ) : (
    <Badge tone="success">Active</Badge>
  );

  const more: RowMenuItem[] = actions
    ? [
        ...(left
          ? [
              { label: "Send farewell", onSelect: () => actions.farewell(s) },
              { label: "Bring back", onSelect: () => actions.bringBack(s) },
            ]
          : [
              paused ? { label: "Resume access", onSelect: () => actions.resume(s) } : { label: "Pause access", onSelect: () => actions.pause(s) },
              { label: "Mark as left…", onSelect: () => actions.leave(s) },
            ]),
      ]
    : [];

  return (
    <>
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-display text-sm font-bold uppercase text-ink-2">
          {s.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cld(s.photoUrl, 96)} alt="" className="h-full w-full object-cover" />
          ) : (
            name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("")
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold tracking-[-0.01em] text-ink">{name}</h2>
          <button
            type="button"
            onClick={() => void copyText(s.username).then((ok) => toast(ok ? "Username copied." : "Couldn't copy. Your browser blocked it; try again.", ok ? "success" : "error"))}
            className="group inline-flex min-h-8 max-w-full items-center gap-1.5 text-sm text-ink-3 hover:text-ink pointer-coarse:min-h-11"
            title="Copy username"
          >
            <span className="truncate">{s.username}</span>
            <span className="text-xs font-semibold underline-offset-4 group-hover:underline">Copy</span>
          </button>
        </div>
        <div className="-mr-2 flex shrink-0 items-center">
          <button type="button" onClick={() => prev && onMove(prev)} disabled={!prev} aria-label="Previous student" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30">
            <Icon.ChevronLeft className="h-5 w-5 rotate-90" />
          </button>
          <button type="button" onClick={() => next && onMove(next)} disabled={!next} aria-label="Next student" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30">
            <Icon.ChevronRight className="h-5 w-5 rotate-90" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            <Icon.Close className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {status}
            <span className="text-sm text-ink-2">{inPerson ? "In person" : "Online"}</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
            {cohort && <CohortDot color={cohort.color} />}
            <span>{cohort?.name ?? "No cohort"}</span>
            {levels && <span className="text-ink-3">· {levels}</span>}
          </p>
          {subjects && <p className="text-sm text-ink-3">{subjects}</p>}
          {left?.farewell?.rating && <p className="text-sm text-ink-2">Rated the classes <span className="tabular-nums">{left.farewell.rating} of 5</span></p>}
        </div>

        {!staff && (s.phone || s.whatsapp) && (
          <div className="flex flex-wrap gap-2">
            {s.phone && (
              <a href={`https://wa.me/${waDigits(s.phone)}`} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })} title={s.phone}>
                WhatsApp student
              </a>
            )}
            {s.whatsapp && (
              <a href={`https://wa.me/${waDigits(s.whatsapp)}`} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })} title={s.whatsapp}>
                WhatsApp parent
              </a>
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Attendance4w db={db} student={s} paused={paused} inPerson={inPerson} fallback={fig?.attendance ?? null} />
          <Figure label="Homework done" value={pct(fig?.homeworkDone)} />
          <Figure label="Test average" value={pct(fig?.average)} />
          <Figure label="Last test" value={pct(fig?.last)} />
          <Figure label="Homework owed" value={String(fig?.owed ?? 0)} />
          {!staff && <LastSeen db={db} studentId={s.id} />}
        </dl>

        {owedShown.length > 0 && (
          <section>
            <h3 className="label-quiet mb-1.5 text-ink-3">Homework owed</h3>
            <ul className="space-y-1 text-sm">
              {owedShown.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">{a.title}</span>
                  <span className="shrink-0 tabular-nums text-ink-3">{formatDate(a.dueAt)}</span>
                </li>
              ))}
              {owed.length > 3 && <li className="text-ink-3">and {owed.length - 3} more</li>}
            </ul>
          </section>
        )}

        <section>
          <h3 className="label-quiet mb-1.5 text-ink-3">Latest results</h3>
          {results.length === 0 ? (
            <p className="text-sm text-ink-3">None released yet.</p>
          ) : (
            <ul className="divide-y divide-hairline text-sm">
              {results.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/grading/${r.id}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5 hover:text-ink">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{r.title}</span>
                      {r.at && <span className="block tabular-nums text-ink-3">{formatTimestamp(r.at)}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-2">{pct(r.percent)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-paper/50 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <Link href={`/admin/roster/${s.id}`} className={buttonClasses({ size: "sm" })}>
          Open full page
        </Link>
        {actions && (
          <>
            <button type="button" onClick={() => actions.edit(s)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Edit
            </button>
            {!inPerson && (
              <Link href={`/admin/roster/${s.id}?report=1`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Monthly report
              </Link>
            )}
            <RowMenu className="ml-auto" label={`More for ${name}`} items={more} />
          </>
        )}
      </div>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-ink">
        {value}
        {note && <span className="ml-1 text-xs font-normal text-ink-3">{note}</span>}
      </dd>
    </div>
  );
}

/** Classes they joined in the last 4 weeks, from the Join taps: the student page's sum. */
function Attendance4w({ db, student, paused, inPerson, fallback }: { db: Database; student: Student; paused: boolean; inPerson: boolean; fallback: number | null }) {
  const nowMs = useNow();
  const today = pkDate(nowMs);
  const from = addDays(today, -27);
  const { joins, joinsOk } = useClassLinks(from, today, true, false);
  const sum = useMemo(() => {
    // Paused: which days fell inside the pause isn't known, so nothing is shown rather than false misses.
    if (!joinsOk || paused || inPerson) return null;
    const rows = subjectSummary(subjectAttendance(db, { joins, joinsOk: true, nowMs })(student, from, today));
    const due = rows.reduce((n, r) => n + r.due, 0);
    const came = rows.reduce((n, r) => n + r.came, 0);
    return due ? { came, due } : null;
  }, [db, student, joins, joinsOk, paused, inPerson, nowMs, from, today]);
  // The headline figure is this month's, the same number as the roster row and the student page's tile.
  if (inPerson || !sum) return <Figure label="Attendance, this month" value={pct(fallback)} />;
  return <Figure label="Attendance, this month" value={pct(fallback)} note={`4 weeks: ${sum.came} of ${sum.due} classes`} />;
}

function LastSeen({ db, studentId }: { db: Database; studentId: string }) {
  const nowMs = useNow();
  const { data } = useActivity(addDays(pkDate(nowMs), -30), db, studentId);
  const at = data ? lastSeen(data[studentId]) : null;
  return <Figure label="Last seen" value={at ? formatDate(new Date(at).toISOString()) : "–"} />;
}
