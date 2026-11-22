"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { assignmentsForStudent, studentById, testsForStudent } from "@/lib/data/selectors";
import { dueFor } from "@/lib/due";
import { formatRelative } from "@/lib/time";
import { addDays, pkDate } from "@/lib/timetable";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CaughtUpMark, PageHeader, SectionTitle } from "@/components/student/PortalKit";

/**
 * Study (phones, Nov 2026, to match the phone app's Study tab): ONE list of
 * everything to do, tests and homework together, no switch. Built from the
 * same rule as Home and the dock's badge (dueFor), so the three always agree.
 *
 * Sections, in this order, each only when it has rows:
 *  - Late: homework past its due time (last 14 days), most overdue first.
 *  - Open now: tests open to sit, closing soonest first.
 *  - Due soon: homework still to hand in, soonest first.
 *  - Done recently: the last few handed in or taken (3 shown, the rest behind "Show more").
 *
 * Tests and Homework keep their own pages (linked at the bottom), so old links still land.
 * Reference: mobile-1.2 src/lib/home/study-list.ts.
 */

type Row = {
  key: string;
  type: "Test" | "Homework";
  subject: string | null;
  title: string;
  line: string;
  href: string;
  late?: boolean;
  open?: boolean;
};

type Section = { id: "late" | "open" | "soon" | "done"; title: string; rows: Row[] };

const DONE_SHOWN = 3;
const DONE_KEPT = 10;

/** "today", "yesterday", "Monday" (this past week), else "Fri 28 Nov". Pakistan dates. */
function pastDay(ms: number, now: number): string {
  const ymd = pkDate(ms);
  const today = pkDate(now);
  if (ymd === today) return "today";
  if (ymd === addDays(today, -1)) return "yesterday";
  const opts = (o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString("en-GB", { ...o, timeZone: "Asia/Karachi" });
  if (ymd < today && ymd >= addDays(today, -6)) return opts({ weekday: "long" });
  return opts({ weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

const homeworkHref = (id: string) => `/assignments#a-${id}`;

function studyList(db: Database, student: Student, now: number): Section[] {
  const due = dueFor(db, student, now);
  const subjectName = (id: string | null | undefined) => (id ? (db.subjects.find((s) => s.id === id)?.name ?? null) : null);
  const ms = (iso: string) => +new Date(iso);

  const late: Row[] = due.overdue.map((a) => {
    const day = pastDay(ms(a.dueAt), now);
    return { key: `a-${a.id}`, type: "Homework", subject: subjectName(a.subjectId), title: a.title, line: `Was due ${day}`, href: homeworkHref(a.id), late: true };
  });
  const open: Row[] = due.openTests.map((t) => ({
    key: `t-${t.id}`,
    type: "Test",
    subject: t.subject || null,
    title: t.title,
    line: `Closes ${formatRelative(t.closesAt, now)}`,
    href: `/test/${t.id}`,
    open: true,
  }));
  const soon: Row[] = due.dueSoon.map((a) => ({
    key: `a-${a.id}`,
    type: "Homework",
    subject: subjectName(a.subjectId),
    title: a.title,
    line: `Due ${formatRelative(a.dueAt, now)}`,
    href: homeworkHref(a.id),
  }));

  // Done recently: tests sat (not just started) and homework handed in, newest first.
  const time = (iso: string | undefined, fallback: string) => {
    const v = iso ? ms(iso) : NaN;
    return Number.isFinite(v) ? v : ms(fallback);
  };
  const tests = new Map(testsForStudent(db, student).map((t) => [t.id, t]));
  const done: Array<Row & { at: number }> = [];
  for (const s of db.submissions) {
    if (s.studentId !== student.id || s.status === "in_progress") continue;
    const t = tests.get(s.testId);
    if (!t) continue;
    const at = Math.min(time(s.submittedAt, t.closesAt), now);
    const released = s.status === "released";
    done.push({
      key: `d-t-${t.id}`,
      type: "Test",
      subject: t.subject || null,
      title: t.title,
      line: released ? "Result ready" : `Taken ${pastDay(at, now)}`,
      href: released ? `/results/${t.id}` : "/tests",
      at,
    });
  }
  const homework = new Map(assignmentsForStudent(db, student).map((a) => [a.id, a]));
  for (const h of db.assignmentSubmissions) {
    if (h.studentId !== student.id) continue;
    const a = homework.get(h.assignmentId);
    if (!a) continue;
    const at = Math.min(time(h.submittedAt, a.dueAt), now);
    done.push({ key: `d-a-${a.id}`, type: "Homework", subject: subjectName(a.subjectId), title: a.title, line: `Handed in ${pastDay(at, now)}`, href: homeworkHref(a.id), at });
  }
  done.sort((a, b) => b.at - a.at);

  const out: Section[] = [];
  if (late.length) out.push({ id: "late", title: "Late", rows: late });
  if (open.length) out.push({ id: "open", title: "Open now", rows: open });
  if (soon.length) out.push({ id: "soon", title: "Due soon", rows: soon });
  if (done.length) out.push({ id: "done", title: "Done recently", rows: done.slice(0, DONE_KEPT) });
  return out;
}

export default function StudyPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const [allDone, setAllDone] = useState(false);
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const sections = useMemo(() => (student ? studyList(db, student, nowMs) : []), [db, student, nowMs]);

  if (!student) return null;
  const toDo = sections.filter((s) => s.id !== "done").reduce((n, s) => n + s.rows.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
        <PageHeader title="Study">
          {toDo === 0 ? "Nothing to do right now." : toDo === 1 ? "One thing to do." : `${toDo} things to do.`} Your tests and homework, together.
        </PageHeader>

        {toDo === 0 && (
          <div className="surface flex items-center gap-4 rounded-card p-5 sm:p-6">
            <CaughtUpMark />
            <p className="text-base text-ink-2">
              <span className="block font-semibold text-ink">You&apos;re all caught up.</span>
              New tests and homework show up here.
            </p>
          </div>
        )}

        {sections.map((s) => {
          const rows = s.id === "done" && !allDone ? s.rows.slice(0, DONE_SHOWN) : s.rows;
          return (
            <section key={s.id} aria-labelledby={`study-${s.id}`}>
              <SectionTitle id={`study-${s.id}`} count={s.id === "done" ? undefined : s.rows.length}>
                {s.title}
              </SectionTitle>
              <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
                {rows.map((r) => (
                  <StudyRow key={r.key} row={r} />
                ))}
              </ul>
              {s.id === "done" && s.rows.length > DONE_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllDone(!allDone)}
                  aria-expanded={allDone}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                >
                  {allDone ? "Show less" : "Show more"}
                </button>
              )}
            </section>
          );
        })}

        {/* The full pages, for anything older. */}
        <nav aria-label="All tests and homework" className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Link href="/tests" className="inline-flex min-h-11 items-center gap-1 font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            All tests <Icon.ChevronRight className="h-4 w-4" />
          </Link>
          <Link href="/assignments" className="inline-flex min-h-11 items-center gap-1 font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            All homework <Icon.ChevronRight className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </div>
  );
}

/** One row: the type and subject, the title, the time line and a chevron. The whole row opens that test or homework. */
function StudyRow({ row }: { row: Row }) {
  return (
    <li>
      <Link
        href={row.href}
        className="row-link flex items-center gap-3 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-6"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-3">
            {row.open && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
            <span>{row.type}</span>
            {row.subject && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate font-medium">{row.subject}</span>
              </>
            )}
          </span>
          <span className="mt-1 line-clamp-2 block break-words text-base font-semibold text-ink">{row.title}</span>
          <span className={cn("mt-0.5 block text-sm tabular-nums", row.late ? "text-warning" : "text-ink-3")}>{row.line}</span>
        </span>
        <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}
