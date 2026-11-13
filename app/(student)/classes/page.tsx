"use client";

import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { joinedMs, studentById } from "@/lib/data/selectors";
import { ClassNow } from "@/components/student/ClassNow";
import { Badge, EmptyState, Icon, Skeleton } from "@/components/ui";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useSchedule, LEVEL_LABEL, RECORDING_HOURS, getSchedule, addDays, isClassDay, levelOf, pkDate, slotKey, slotsForStudent, slotsOn, span, useClassLinks } from "@/lib/classes";
import { anythingOpen, useRecordingRows, useStudentAccess, type RecordingRow } from "@/lib/recordings";
import { openUntil } from "@/lib/recording-access";
import { useState } from "react";
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

/** True on a phone set to another time zone (the Gulf). Pakistan is five hours ahead of UTC all year. */
const away = (ms: number) => new Date(ms).getTimezoneOffset() !== -300;
/** A moment on the phone's own clock: "6:30 PM". */
const ownClock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
/** When a recording closes, on the phone's own clock: "Wed, 9:30 PM" (the same as Pakistan time in Pakistan). */
const closesLabel = (ms: number) =>
  `${new Date(ms).toLocaleDateString("en-GB", { weekday: "short" })}, ${ownClock(ms)}${away(ms) ? " your time" : ""}`;

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
  const { links, ready } = useClassLinks(from, today, false, nearClass);
  const schedule = useSchedule(); // re-render when the timetable loads or changes

  // The timetable is the same every class day, so show one (the next) day's slots.
  // Once today's last class has ended, tomorrow's is what matters.
  const doneToday = !!student && slotsForStudent(db, student, today).length > 0 && slotsForStudent(db, student, today).every((s) => s.endMs <= nowMs);
  let day = today < schedule.termStarts ? schedule.termStarts : doneToday ? addDays(today, 1) : today;
  const mine = (d: string) => (student ? [...slotsForStudent(db, student, d), ...cancelledFor(db, student, d)].sort((a, b) => a.startMs - b.startMs) : []);
  // The next day this student has a class. Any class day would do when everyone
  // sits every day, but a subject that runs on some days only left its students
  // looking at "once I add your level and subjects" on the days in between.
  let slots = mine(day);
  for (let i = 1, d = day; !slots.length && i <= 14; i++) {
    d = addDays(d, 1);
    const found = mine(d);
    if (found.length) {
      day = d;
      slots = found;
    }
  }
  // Nothing in the next two weeks: fall back to the next class day (and the note below).
  if (!slots.length) for (let i = 0; i < 7 && !isClassDay(day); i++) day = addDays(day, 1);

  // Hamza can open older recordings for a while (a catch-up window, or one recording).
  const access = useStudentAccess();
  const olderOpen = !!student && anythingOpen(access, nowMs);
  const { rows: olderRows } = useRecordingRows(olderOpen);

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
      .filter((l) => l.recordingUrl && closes.has(slotKey(l)))
      .map((l) => ({
        ...l,
        closesAt: openUntil(slotKey(l), l.date, closes.get(slotKey(l))!, access, nowMs),
        subject: db.subjects.find((s) => s.id === l.subjectId)?.name ?? "Class",
      }))
      .filter((l) => l.closesAt > nowMs)
      .sort((a, b) => b.closesAt - a.closesAt);
  })();

  // Older recordings Hamza has opened: my own levels and subjects only, newest first.
  const older = (() => {
    if (!student || !olderOpen) return [];
    const recent = new Set(recordings.map((r) => slotKey(r)));
    const cohort = db.cohorts.find((c) => c.id === student.cohortId);
    const classes = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
    const mine = (classId: string, subjectId: string) => {
      if (!classes.includes(classId)) return false;
      const subjects = subjectsAtLevel(student, classId, cohort?.subjectIds);
      return !subjects.length || subjects.includes(subjectId);
    };
    return olderRows
      .filter((r) => !recent.has(r.key) && mine(r.classId, r.subjectId))
      .map((r) => {
        const cls = db.classes.find((c) => c.id === r.classId);
        const lvl = cls ? levelOf(cls) : null;
        return {
          ...r,
          closesAt: openUntil(r.key, r.date, 0, access, nowMs),
          subject: db.subjects.find((s) => s.id === r.subjectId)?.name ?? "Class",
          level: lvl ? LEVEL_LABEL[lvl] : (cls?.name ?? ""),
        };
      })
      .filter((r) => r.closesAt > nowMs && r.date <= today);
  })();
  const twoLevels = new Set(older.map((r) => r.classId)).size > 1;

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
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
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
                <span className="shrink-0 text-right">
                  <span className={cn("block text-sm tabular-nums", s.cancelled ? "text-ink-3 line-through" : "text-ink-2")}>{span(s.start, s.end)}</span>
                  {/* The page is in Pakistan time; a phone set to another zone gets its own start time too. */}
                  {!s.cancelled && away(s.startMs) && <span className="mt-0.5 block text-xs text-ink-3 tabular-nums">{ownClock(s.startMs)} your time</span>}
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
                    <span className="block text-xs text-ink-3 tabular-nums">
                      {dayName(r.date)} · open until {closesLabel(r.closesAt)}
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
        ) : pending.length ? null : ready === null ? (
          // Still fetching: a placeholder, not "No recordings" for a moment and then a list.
          <Skeleton className="h-[72px] w-full rounded-xl" />
        ) : ready === false ? (
          <p className="surface-quiet rounded-xl px-5 py-4 text-base text-ink-2">Couldn&apos;t load your recordings. Check your internet, then open this page again.</p>
        ) : (
          <EmptyState
            icon={<Icon.Doc />}
            title="No recordings right now"
            message="Each class recording appears here after class."
          />
        )}
        </div>
      </section>

      {older.length > 0 && (
        <PastRecordings
          items={older}
          twoLevels={twoLevels}
          watched={watched}
          onWatch={(key) => updateProfile((p) => ({ watched: [...(p.watched ?? []).filter((k) => k !== key), key].slice(-60) }))}
        />
      )}
      </div>
    </div>
  );
}

type PastItem = RecordingRow & { closesAt: number; subject: string; level: string };
/** Past classes shown before "Show all": enough to catch up on the latest week, short enough for a phone. */
const FIRST = 6;
const monthName = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/**
 * Older recordings while Hamza has them open: a subject filter, months as
 * headings, newest first. Only the latest few show until the student asks for
 * the rest, so a catch-up window of 90 classes doesn't bury the page.
 */
function PastRecordings({ items, twoLevels, watched, onWatch }: { items: PastItem[]; twoLevels: boolean; watched: Set<string>; onWatch: (key: string) => void }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const subjects = [...new Set(items.map((i) => i.subject))].sort();
  const list = items.filter((i) => !subject || i.subject === subject).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.subject.localeCompare(b.subject)));
  const latest = Math.max(...items.map((i) => i.closesAt));
  const visible = all ? list : list.slice(0, FIRST);
  const months: Array<{ name: string; rows: PastItem[] }> = [];
  for (const r of visible) {
    const name = monthName(r.date);
    if (months[months.length - 1]?.name !== name) months.push({ name, rows: [] });
    months[months.length - 1].rows.push(r);
  }
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
      on ? "border-border-strong bg-surface-2 text-ink" : "border-hairline text-ink-3 hover:text-ink",
    );
  return (
    <section>
      <SectionTitle count={items.length} sub={`Past classes are open for you to catch up until ${closesLabel(latest)}.`}>
        Catch up on past classes
      </SectionTitle>
      {subjects.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Subject">
          <button type="button" className={chip(!subject)} aria-pressed={!subject} onClick={() => { setSubject(null); setAll(false); }}>
            All
          </button>
          {subjects.map((s) => (
            <button key={s} type="button" className={chip(subject === s)} aria-pressed={subject === s} onClick={() => { setSubject(s); setAll(false); }}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-5">
        {months.map((m) => (
          <div key={m.name}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{m.name}</p>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-xl">
              {m.rows.map((r) => (
                <li key={r.key}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onWatch(r.key)}
                    className="flex min-h-14 items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02] sm:px-6"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{r.subject}</span>
                      <span className="block text-xs text-ink-3 tabular-nums">
                        {dayName(r.date)}
                        {twoLevels && r.level ? ` · ${r.level}` : ""}
                        {r.closesAt < latest ? ` · open until ${closesLabel(r.closesAt)}` : ""}
                      </span>
                    </span>
                    {watched.has(r.key) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-success">
                        <Icon.Check className="h-4 w-4" /> Watched
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
                        Watch <Icon.ChevronRight className="h-4 w-4" />
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {!all && list.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-hairline text-sm font-semibold text-ink-2 hover:text-ink"
        >
          Show all {list.length}
        </button>
      )}
    </section>
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
