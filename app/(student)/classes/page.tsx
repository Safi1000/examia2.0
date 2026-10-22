"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { ClassNow } from "@/components/student/ClassNow";
import { EmptyState, Icon } from "@/components/ui";
import { LEVEL_LABEL, TERM_STARTS, addDays, isClassDay, pkDate, slotKey, slotsForStudent, timeLabel, useClassLinks } from "@/lib/classes";

/** The student's daily timetable and the recordings of past classes. */
export default function ClassesPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const today = pkDate(nowMs);
  const from = addDays(today, -60);
  const { links } = useClassLinks(from, today);

  // The timetable is the same every class day, so show one (the next) day's slots.
  const day = useMemo(() => {
    let d = today < TERM_STARTS ? TERM_STARTS : today;
    for (let i = 0; i < 7 && !isClassDay(d); i++) d = addDays(d, 1);
    return d;
  }, [today]);
  const slots = student ? slotsForStudent(db, student, day) : [];

  const recordings = (() => {
    if (!student) return [];
    const mine = new Set<string>();
    for (let d = from; d <= today; d = addDays(d, 1)) for (const s of slotsForStudent(db, student, d)) mine.add(slotKey(s));
    return links
      .filter((l) => l.recordingUrl && mine.has(slotKey(l)))
      .map((l) => ({ ...l, subject: db.subjects.find((s) => s.id === l.subjectId)?.name ?? "Class" }))
      .sort((a, b) => b.date.localeCompare(a.date));
  })();

  if (!student) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-9 px-4 py-8 sm:px-6">
      <header className="animate-fade-up">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">Monday to Friday · Pakistan time</p>
        <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">Classes</h1>
        {today < TERM_STARTS && <p className="mt-2.5 text-base text-ink-2">
            Classes start on {new Date(`${TERM_STARTS}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.
          </p>}
      </header>

      <ClassNow db={db} student={student} nowMs={nowMs} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Your timetable</h2>
        {slots.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {slots.map((s) => (
              <li key={slotKey(s)} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span>
                  <span className="block font-semibold text-ink">{s.subject}</span>
                  <span className="block text-xs text-ink-3">{LEVEL_LABEL[s.level]}</span>
                </span>
                <span className="text-sm tabular-nums text-ink-2">
                  {timeLabel(s.start)} to {timeLabel(s.end)} PM
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">Your timetable shows here once Hamza adds your level and subjects.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Recordings</h2>
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
                      {new Date(`${r.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    Watch <Icon.ChevronRight className="h-4 w-4" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Icon.Doc />} title="No recordings yet" message="Recordings of your classes will appear here." />
        )}
      </section>
    </div>
  );
}
