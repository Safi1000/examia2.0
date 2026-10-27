"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { ClassNow } from "@/components/student/ClassNow";
import { Badge, EmptyState, Icon } from "@/components/ui";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useSchedule, LEVEL_LABEL, RECORDING_HOURS, getSchedule, addDays, isClassDay, pkDate, slotKey, slotsForStudent, slotsOn, span, useClassLinks } from "@/lib/classes";
import { cn } from "@/lib/cn";

/**
 * The student's classes that were called off on a date. `slotsForStudent`
 * leaves them out; the timetable shows them struck through instead, so nobody
 * waits for a class that isn't on. Same level and subject rules as there.
 */
function cancelledFor(db: Database, student: Student, date: string) {
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const classes = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
  const subjects = student.subjectIds.length ? student.subjectIds : (cohort?.subjectIds ?? []);
  return slotsOn(db, date).filter((s) => s.cancelled && classes.includes(s.classId) && (!subjects.length || subjects.includes(s.subjectId)));
}

const dayName = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** The student's daily timetable and the recordings of past classes. */
export default function ClassesPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const today = pkDate(nowMs);
  // Recordings stay open for a day, so two days back is plenty.
  const from = addDays(today, -2);
  const { links } = useClassLinks(from, today);
  const schedule = useSchedule(); // re-render when the timetable loads or changes

  // The timetable is the same every class day, so show one (the next) day's slots.
  const day = useMemo(() => {
    let d = today < schedule.termStarts ? schedule.termStarts : today;
    for (let i = 0; i < 7 && !isClassDay(d); i++) d = addDays(d, 1);
    return d;
  }, [today, schedule]);
  const slots = student
    ? [...slotsForStudent(db, student, day), ...cancelledFor(db, student, day)].sort((a, b) => a.startMs - b.startMs)
    : [];

  const recordings = (() => {
    if (!student) return [];
    // Each of my classes, and when its recording closes (24 h after it ends).
    const closes = new Map<string, number>();
    for (let d = from; d <= today; d = addDays(d, 1))
      for (const s of slotsForStudent(db, student, d)) closes.set(slotKey(s), s.endMs + RECORDING_HOURS * 3_600_000);
    return links
      .filter((l) => l.recordingUrl && nowMs < (closes.get(slotKey(l)) ?? 0))
      .map((l) => ({ ...l, closesAt: closes.get(slotKey(l))!, subject: db.subjects.find((s) => s.id === l.subjectId)?.name ?? "Class" }))
      .sort((a, b) => b.closesAt - a.closesAt);
  })();

  // My classes that ended in the last 3 hours with no recording yet: Meet takes
  // 30 to 60 minutes to save one, so say it is coming rather than show nothing.
  const pending = student
    ? slotsForStudent(db, student, today)
        .filter((s) => nowMs >= s.endMs && nowMs < s.endMs + 3 * 3_600_000)
        .filter((s) => !links.some((l) => slotKey(l) === slotKey(s) && l.recordingUrl))
        .reverse()
    : [];

  if (!student) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-9 px-4 py-8 sm:px-6">
      <header className="animate-fade-up">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">{dayRange(schedule.days)} · Pakistan time</p>
        <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">Classes</h1>
        {today < getSchedule().termStarts && <p className="mt-2.5 text-base text-ink-2">
            Classes start on {new Date(`${getSchedule().termStarts}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.
          </p>}
      </header>

      <ClassNow db={db} student={student} nowMs={nowMs} />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Your timetable</h2>
          <p className="text-sm font-semibold text-ink-2">{day === today ? "Today" : dayName(day)}</p>
        </div>
        {slots.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {slots.map((s) => (
              <li key={slotKey(s)} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-semibold", s.cancelled ? "text-ink-3 line-through" : "text-ink")}>{s.subject}</span>
                    {s.cancelled ? (
                      <Badge className="px-2 text-[11px]">Cancelled</Badge>
                    ) : s.extra ? (
                      <Badge tone="brand" className="px-2 text-[11px]">Extra</Badge>
                    ) : s.changed ? (
                      <Badge tone="warning" className="px-2 text-[11px]">Moved</Badge>
                    ) : null}
                  </span>
                  <span className="block text-xs text-ink-3">{LEVEL_LABEL[s.level]}</span>
                </span>
                <span className={cn("shrink-0 text-sm tabular-nums", s.cancelled ? "text-ink-3 line-through" : "text-ink-2")}>
                  {span(s.start, s.end)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">Your timetable shows here once Hamza adds your level and subjects.</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Recordings</h2>
          <p className="mt-0.5 text-sm text-ink-3">Watch within {RECORDING_HOURS} hours of class. After that they close.</p>
        </div>
        {pending.length > 0 && (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={slotKey(p)} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-5 py-3.5">
                <span>
                  <span className="block font-semibold text-ink">{p.subject}</span>
                  <span className="block text-xs text-ink-3">Today, {span(p.start, p.end)}</span>
                </span>
                <span className="text-xs font-medium text-ink-3">Recording on its way, usually within an hour</span>
              </li>
            ))}
          </ul>
        )}
        {recordings.length ? (
          <ul className="space-y-2">
            {recordings.map((r) => (
              <li key={slotKey(r)}>
                <a
                  href={r.recordingUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-3.5 transition-colors hover:border-border-strong"
                >
                  <span>
                    <span className="block font-semibold text-ink">{r.subject}</span>
                    <span className="block text-xs text-ink-3">
                      {new Date(`${r.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · open
                      until{" "}
                      {new Date(r.closesAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    Watch <Icon.ChevronRight className="h-4 w-4" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : pending.length ? null : (
          <EmptyState
            icon={<Icon.Doc />}
            title="No recordings right now"
            message={`Each class recording appears here after class and stays open for ${RECORDING_HOURS} hours.`}
          />
        )}
      </section>
    </div>
  );
}

/** [1,2,3,4,5] → "Monday to Friday"; other sets are listed. */
function dayRange(days: number[]) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const d = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const consecutive = d.every((x, i) => i === 0 || (d[i - 1] + 1) % 7 === x);
  if (d.length > 2 && consecutive) return `${names[d[0]]} to ${names[d[d.length - 1]]}`;
  return d.map((x) => names[x].slice(0, 3)).join(", ");
}
