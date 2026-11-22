"use client";

import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { joinedMs, studentById } from "@/lib/data/selectors";
import { ClassNow } from "@/components/student/ClassNow";
import { Badge, Icon, Skeleton } from "@/components/ui";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useSchedule, LEVEL_LABEL, levelName, RECORDING_HOURS, getSchedule, addDays, isClassDay, levelOf, pkDate, slotKey, slotsForStudent, slotsOn, span, spanHere, useClassLinks } from "@/lib/classes";
import { anythingOpen, useRecordingRows, useStudentAccess, type RecordingRow } from "@/lib/recordings";
import { openUntil } from "@/lib/recording-access";
import { useCallback, useEffect, useRef, useState } from "react";
import { RecordingPlayer } from "@/components/student/RecordingPlayer";
import { driveFileId, watchPatch } from "@/lib/watch";
import { cn } from "@/lib/cn";
import { subjectsAtLevel } from "@/lib/levels";
import { PageHeader, SectionTitle } from "@/components/student/PortalKit";
import { chipClass } from "@/components/ui/Segmented";
import { buttonClasses } from "@/components/ui/Button";
import { formatRelative } from "@/lib/time";

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
  // A Drive recording plays here, inside the portal; any other link opens in a new tab as before.
  const [playing, setPlaying] = useState<{ key: string; fileId: string; url: string; title: string; sub: string } | null>(null);
  const playingKey = playing?.key;
  const addTime = useCallback((sec: number) => { if (playingKey) updateProfile(watchPatch(playingKey, sec)); }, [playingKey, updateProfile]);
  const closePlayer = useCallback(() => setPlaying(null), []);
  const watch = (e: React.MouseEvent, key: string, url: string, title: string, sub: string) => {
    updateProfile(watchPatch(key, 0));
    const fileId = driveFileId(url);
    if (!fileId || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setPlaying({ key, fileId, url, title, sub });
  };
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

  // One list of every recording this student can open now, from two sources:
  // the last few days' classes (each open 48 hours after it ends) and older
  // classes Hamza has opened (a catch-up window, or one recording).
  const recordings = (() => {
    if (!student) return [];
    // Each of my classes, and when it ended (its recording closes 48 hours later).
    const ended = new Map<string, number>();
    for (let d = from; d <= today; d = addDays(d, 1))
      for (const s of slotsForStudent(db, student, d)) {
        // Only classes from after they joined.
        if (s.endMs < joinedMs(student)) continue;
        ended.set(slotKey(s), s.endMs);
      }
    const describe = (classId: string, subjectId: string) => {
      const cls = db.classes.find((c) => c.id === classId);
      const lvl = cls ? levelOf(cls) : null;
      return { subject: db.subjects.find((s) => s.id === subjectId)?.name ?? "Class", level: lvl ? LEVEL_LABEL[lvl] : (cls?.name ?? "") };
    };
    const out = new Map<string, RecordingItem>();
    for (const l of links) {
      const key = slotKey(l);
      if (!l.recordingUrl || !ended.has(key)) continue;
      const endMs = ended.get(key)!;
      const closesAt = openUntil(key, l.date, endMs + RECORDING_HOURS * 3_600_000, access, nowMs);
      if (closesAt > nowMs) out.set(key, { key, date: l.date, classId: l.classId, subjectId: l.subjectId, url: l.recordingUrl, closesAt, endMs, ...describe(l.classId, l.subjectId) });
    }
    if (olderOpen) {
      // Older recordings: my own levels and subjects only.
      const cohort = db.cohorts.find((c) => c.id === student.cohortId);
      const classes = student.classIds.length ? student.classIds : (cohort?.classIds ?? []);
      const mine = (classId: string, subjectId: string) => {
        if (!classes.includes(classId)) return false;
        const subjects = subjectsAtLevel(student, classId, cohort?.subjectIds);
        return !subjects.length || subjects.includes(subjectId);
      };
      for (const r of olderRows) {
        if (out.has(r.key) || r.date > today || !mine(r.classId, r.subjectId)) continue;
        const closesAt = openUntil(r.key, r.date, 0, access, nowMs);
        if (closesAt > nowMs) out.set(r.key, { ...r, closesAt, endMs: 0, ...describe(r.classId, r.subjectId) });
      }
    }
    // Newest first: by date, then the later class that day, then by subject.
    return [...out.values()].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.endMs - a.endMs || a.subject.localeCompare(b.subject)));
  })();
  // Of these, the ones from the last few days: always shown, never behind "Show all".
  const recentCount = recordings.filter((r) => r.endMs > 0).length;

  // Home's "Watch" on a class recording opens here with ?watch=<class key>: open that
  // recording's player straight away (once), as if Watch had been tapped on this page.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !recordings.length || typeof window === "undefined") return;
    const want = new URLSearchParams(window.location.search).get("watch");
    if (!want) return;
    autoOpened.current = true;
    const r = recordings.find((x) => x.key === want);
    if (!r?.url) return;
    updateProfile(watchPatch(want, 0));
    const fileId = driveFileId(r.url);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fileId) setPlaying({ key: want, fileId, url: r.url, title: r.subject, sub: dayName(r.date) });
    else window.open(r.url, "_blank", "noopener,noreferrer");
  }, [recordings, updateProfile]);

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
          <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
            {slots.map((s) => (
              <li key={slotKey(s)} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-base font-semibold", s.cancelled ? "text-ink-3 line-through" : "text-ink")}>{s.subject}</span>
                    {s.cancelled ? (
                      <Badge className="px-2 text-xs">Cancelled</Badge>
                    ) : s.extra ? (
                      <Badge className="px-2 text-xs">Extra</Badge>
                    ) : s.changed ? (
                      <Badge className="px-2 text-xs">Moved</Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-3">
                    {levelName(s)}
                    {s.joint && !s.cancelled ? " · joint class" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn("block text-sm tabular-nums", s.cancelled ? "text-ink-3 line-through" : "text-ink-2")}>{span(s.start, s.end)}</span>
                  {/* The page is in Pakistan time; a phone set to another zone gets its own start time too. */}
                  {!s.cancelled && away(s.startMs) && (
                    <span className="mt-0.5 block text-sm text-ink-3 tabular-nums">
                      {ownClock(s.startMs)} to {ownClock(s.endMs)} your time
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="surface-quiet rounded-card p-5 text-base text-ink-2 sm:p-6">Your timetable shows here once I add your level and subjects.</p>
        )}
      </section>

      <RecordingList
        items={recordings}
        recentCount={recentCount}
        pending={pending}
        ready={ready}
        nowMs={nowMs}
        watched={watched}
        onWatch={watch}
      />
      {playing && <RecordingPlayer fileId={playing.fileId} url={playing.url} title={playing.title} sub={playing.sub} onTime={addTime} onClose={closePlayer} />}
      </div>
    </div>
  );
}

type RecordingItem = RecordingRow & { closesAt: number; subject: string; level: string; endMs: number };
type PendingSlot = ReturnType<typeof slotsForStudent>[number];
/** Recordings shown before "Show all": enough to catch up on the latest week, short enough for a phone. */
const FIRST = 6;
/** Under this long left, an unwatched recording says when it closes, in red. */
const SOON_MS = 6 * 3_600_000;
const monthName = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/**
 * Every recording the student can open now, in one list, newest first. Each
 * row names its class and date and says until when it is open. Classes that
 * ended a moment ago with no recording yet sit on top. A long list (a catch-up
 * window) gets a subject filter and shows the latest few until asked for the
 * rest; the last few days' recordings always show.
 */
function RecordingList({
  items,
  recentCount,
  pending,
  ready,
  nowMs,
  watched,
  onWatch,
}: {
  items: RecordingItem[];
  recentCount: number;
  pending: PendingSlot[];
  ready: boolean | null;
  nowMs: number;
  watched: Set<string>;
  onWatch: (e: React.MouseEvent, key: string, url: string, title: string, sub: string) => void;
}) {
  const [subject, setSubject] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const long = items.length > FIRST;
  const subjects = long ? [...new Set(items.map((i) => i.subject))].sort() : [];
  const chosen = subject && subjects.includes(subject) ? subject : null;
  const list = items.filter((i) => !chosen || i.subject === chosen);
  const visible = all ? list : list.slice(0, Math.max(FIRST, chosen ? 0 : recentCount));
  const twoLevels = new Set(items.map((i) => i.classId)).size > 1;
  // Month names only when the list runs across more than one month.
  const months: Array<{ name: string; rows: RecordingItem[] }> = [];
  for (const r of visible) {
    const name = monthName(r.date);
    if (months[months.length - 1]?.name !== name) months.push({ name, rows: [] });
    months[months.length - 1].rows.push(r);
  }
  // A catch-up window Hamza opened: say until when.
  const catchUpEnds = Math.max(0, ...items.filter((i) => i.endMs === 0).map((i) => i.closesAt));
  const sub = catchUpEnds
    ? `Each recording stays open for 2 days after class. Past classes are open for you to catch up until ${closesLabel(catchUpEnds)}.`
    : "Each recording stays open for 2 days after class, then it closes.";
  const pick = (s: string | null) => {
    setSubject(s);
    setAll(false);
  };
  return (
    <section>
      <SectionTitle count={long ? items.length : undefined} sub={sub}>
        Recordings
      </SectionTitle>
      <div className="space-y-3">
        {pending.length > 0 && (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={slotKey(p)} className="surface-quiet flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card px-5 py-4 sm:px-6">
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-ink">{p.subject}</span>
                  <span className="mt-0.5 block text-sm text-ink-3 tabular-nums">Today, {spanHere(p.date, p.start, p.end)}</span>
                </span>
                <span className="text-sm text-ink-3">Recording on its way, usually within an hour</span>
              </li>
            ))}
          </ul>
        )}
        {subjects.length > 1 && (
          // Chips wrap to a second line on phones instead of running off the edge.
          <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
            <button type="button" className={chipClass(!chosen)} aria-pressed={!chosen} onClick={() => pick(null)}>
              All
            </button>
            {subjects.map((s) => (
              <button key={s} type="button" className={chipClass(chosen === s)} aria-pressed={chosen === s} onClick={() => pick(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {items.length ? (
          <div className="space-y-5">
            {months.map((m) => (
              <div key={m.name}>
                {months.length > 1 && <p className="label-quiet mb-2 text-ink-3">{m.name}</p>}
                <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
                  {m.rows.map((r) => {
                    const seen = watched.has(r.key);
                    const soon = !seen && r.closesAt - nowMs < SOON_MS;
                    return (
                      <li key={r.key}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => onWatch(e, r.key, r.url, r.subject, dayName(r.date))}
                          className="row-link flex min-h-14 items-center justify-between gap-4 px-5 py-3.5 sm:px-6"
                        >
                          <span className="min-w-0">
                            <span className="block text-base font-semibold text-ink">{r.subject}</span>
                            <span className="mt-0.5 block text-sm text-ink-3 tabular-nums">
                              {dayName(r.date)}
                              {twoLevels && r.level ? ` · ${r.level}` : ""} · open until {closesLabel(r.closesAt)}
                            </span>
                          </span>
                          {seen ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-success">
                              <Icon.Check className="h-4 w-4" /> Watched
                            </span>
                          ) : (
                            <span className="flex shrink-0 flex-col items-end">
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
                                Watch <Icon.ChevronRight className="h-4 w-4" />
                              </span>
                              {soon && (
                                <span className="text-sm font-semibold text-error tabular-nums">Closes {formatRelative(new Date(r.closesAt).toISOString(), nowMs)}</span>
                              )}
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {!all && list.length > visible.length && (
              <button type="button" onClick={() => setAll(true)} className={buttonClasses({ variant: "secondary", fullWidth: true })}>
                Show all {list.length}
              </button>
            )}
          </div>
        ) : pending.length ? null : ready === null ? (
          // Still fetching: a placeholder, not "No recordings" for a moment and then a list.
          <Skeleton className="h-[76px] w-full rounded-card" />
        ) : ready === false ? (
          <p className="surface-quiet rounded-card p-5 text-base text-ink-2 sm:p-6">Couldn&apos;t load your recordings. Check your internet, then open this page again.</p>
        ) : (
          // One quiet line, not a big empty box: the timetable above is what matters today.
          <p className="text-base text-ink-2">Each class recording appears here after class.</p>
        )}
      </div>
    </section>
  );
}

/** [1,2,3,4,5] → "Monday to Friday"; other sets are listed. */
function dayRange(days: number[]) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const d = days.toSorted((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const consecutive = d.every((x, i) => i === 0 || (d[i - 1] + 1) % 7 === x);
  if (d.length > 2 && consecutive) return `${names[d[0]]} to ${names[d[d.length - 1]]}`;
  return d.map((x) => names[x].slice(0, 3)).join(", ");
}
