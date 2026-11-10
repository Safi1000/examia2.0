"use client";

import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { joinedMs, studentById } from "@/lib/data/selectors";
import { ClassNow } from "@/components/student/ClassNow";
import { Badge, EmptyState, Icon } from "@/components/ui";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useSchedule, LEVEL_LABEL, RECORDING_HOURS, getSchedule, addDays, isClassDay, pkDate, slotKey, slotsForStudent, slotsOn, span, useClassLinks } from "@/lib/classes";
import { cn } from "@/lib/cn";
import { subjectsAtLevel } from "@/lib/levels";
import { PageHeader, SectionTitle } from "@/components/student/PortalKit";

/**
 * The student's classes that were called off on a date. `slotsForStudent`
 * leaves them out; the timetable shows them struck through instead, so nobody
 * waits for a class that isn't on. Same level and subject rules as there.
 */
function cancelledFor(db: Database, student: Student, date: string) {
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const classes = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
  return slotsOn(db, date).filter((s) => {
    if (!s.cancelled || !classes.includes(s.classId)) return false;
    const subjects = subjectsAtLevel(student, s.classId, cohort?.subjectIds);
    return !subjects.length || subjects.includes(s.subjectId);
  });
}

const dayName = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** The student's daily timetable and the recordings of past classes. */
export default function ClassesPage() {
  const { session, profile, updateProfile } = useAuth();
  const watched = new Set(profile.watched ?? []);
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const today = pkDate(nowMs);
  // Recordings stay open for 2 days, so three days back covers every one still open.
  const from = addDays(today, -3);
  // Check for fresh links only around class time, not every 20 s all day.
  const nearClass = !!student && slotsForStudent(db, student, today).some((s) => nowMs >= s.startMs - 20 * 60_000 && nowMs < s.endMs);
  const { links } = useClassLinks(from, today, false, nearClass);
  const schedule = useSchedule(); // re-render when the timetable loads or changes

  // The timetable is the same every class day, so show one (the next) day's slots.
  // Once today's last class has ended, tomorrow's is what matters.
  const doneToday = !!student && slotsForStudent(db, student, today).length > 0 && slotsForStudent(db, student, today).every((s) => s.endMs <= nowMs);
  let day = today < schedule.termStarts ? schedule.termStarts : doneToday ? addDays(today, 1) : today;
  for (let i = 0; i < 7 && !isClassDay(day); i++) day = addDays(day, 1);
  const slots = student
    ? [...slotsForStudent(db, student, day), ...cancelledFor(db, student, day)].sort((a, b) => a.startMs - b.startMs)
    : [];

  const recordings = (() => {
    if (!student) return [];
    // Each of my classes, and when its recording closes (48 hours after it ends).
    const closes = new Map<string, number>();
    for (let d = from; d <= today; d = addDays(d, 1))
      for (const s of slotsForStudent(db, student, d)) {
        // Only classes from after they joined.
        if (s.endMs < joinedMs(student)) continue;
        closes.set(slotKey(s), s.endMs + RECORDING_HOURS * 3_600_000);
      }
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
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="Classes" eyebrow={`${dayRange(schedule.days)} · Pakistan time`}>
        {today < getSchedule().termStarts && (
          <p>
            Classes start on {new Date(`${getSchedule().termStarts}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.
          </p>
        )}
      </PageHeader>

      <ClassNow db={db} student={student} nowMs={nowMs} />

      <section>
        <SectionTitle action={<span className="font-semibold text-ink-2">{day === today ? "Today" : dayName(day)}</span>}>Your timetable</SectionTitle>
        {slots.length ? (
          <ul className="surface divide-y divide-hairline overflow-hidden rounded-xl">
            {slots.map((s) => (
              <li key={slotKey(s)} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-semibold", s.cancelled ? "text-ink-3 line-through" : "text-ink")}>{s.subject}</span>
                    {s.cancelled ? (
                      <Badge className="px-2 text-xs">Cancelled</Badge>
                    ) : s.extra ? (
                      <Badge tone="brand" className="px-2 text-xs">Extra</Badge>
                    ) : s.changed ? (
                      <Badge tone="warning" className="px-2 text-xs">Moved</Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-3">{LEVEL_LABEL[s.level]}</span>
                </span>
                <span className={cn("shrink-0 text-sm tabular-nums", s.cancelled ? "text-ink-3 line-through" : "text-ink-2")}>
                  {span(s.start, s.end)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface-quiet rounded-xl px-5 py-4 text-base text-ink-2">Your timetable shows here once I add your level and subjects.</p>
        )}
      </section>

      <section>
        <SectionTitle sub="Each recording stays open for 2 days after class, then it closes.">Recordings</SectionTitle>
        <div className="space-y-2.5">
        {pending.length > 0 && (
          <ul className="space-y-2.5">
            {pending.map((p) => (
              <li key={slotKey(p)} className="surface-quiet flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-5 py-4 sm:px-6">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{p.subject}</span>
                  <span className="mt-0.5 block text-xs text-ink-3 tabular-nums">Today, {span(p.start, p.end)}</span>
                </span>
                <span className="text-xs font-medium text-ink-3">Recording on its way, usually within an hour</span>
              </li>
            ))}
          </ul>
        )}
        {recordings.length ? (
          <ul className="space-y-2.5">
            {recordings.map((r) => (
              <li key={slotKey(r)}>
                <a
                  href={r.recordingUrl!}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => updateProfile((p) => ({ watched: [...(p.watched ?? []).filter((k) => k !== slotKey(r)), slotKey(r)].slice(-60) }))}
                  className={cn(
                    "surface surface-link flex items-center justify-between gap-4 rounded-xl px-5 py-4 sm:px-6",
                    !watched.has(slotKey(r)) && r.closesAt - nowMs < 6 * 3_600_000 && "border-warning/50!",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{r.subject}</span>
                    <span className="block text-xs text-ink-3">
                      {new Date(`${r.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · open
                      until{" "}
                      {new Date(r.closesAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </span>
                  {watched.has(slotKey(r)) ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                      <Icon.Check className="h-4 w-4" /> Watched
                    </span>
                  ) : (
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
                        Watch <Icon.ChevronRight className="h-4 w-4" />
                      </span>
                      {r.closesAt - nowMs < 6 * 3_600_000 && (
                        <span className="text-xs font-semibold text-warning">Closes in {Math.max(1, Math.round((r.closesAt - nowMs) / 3_600_000))} h</span>
                      )}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : pending.length ? null : (
          <EmptyState
            icon={<Icon.Doc />}
            title="No recordings right now"
            message="Each class recording appears here after class."
          />
        )}
        </div>
      </section>
      </div>
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
