"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { archivedCohortIds, canBeSwept } from "@/lib/data/selectors";
import { isInPersonStudent } from "@/lib/in-person";
import { useIsStaff } from "@/lib/staff";
import { studentClassStarted } from "@/lib/portal-messages";
import { usePausedIds } from "@/lib/paused";
import { awayUntilMap } from "@/lib/reminders";
import { displayName, isTestAccount } from "@/lib/display-name";
import { PageHeader } from "@/components/admin/PageHeader";
import { GoogleConnect } from "@/components/admin/GoogleConnect";
import { StartCard } from "@/components/admin/StartCard";
import { TimetableEditor } from "@/components/admin/TimetableEditor";
import { saveDayChange } from "@/components/ScheduleGate";
import type { Exception, SubjectKey } from "@/lib/timetable";
import { Button, Card, Icon, Modal, segmentGroup, segmentItem } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { panel } from "@/components/admin/surface";
import {
  LEVEL_LABEL,
  jointLabel,
  levelName,
  getSchedule,
  addDays,
  isClassDay,
  isTime,
  looksLikeLink,
  tidyLink,
  pkDate,
  slotKey,
  slotsForStudent,
  slotsOn,
  timeLabel,
  clock,
  useSchedule,
  useClassLinks,
  type DaySlot,
  type LevelKey,
} from "@/lib/classes";

/**
 * Hamza's class console. "Day" is one simple timeline: the next class with a
 * Start button, then every class of the day in time order. Everything rarer
 * (move, cancel, own link, recording) sits behind each row's "More".
 * "Weekly timetable" edits the regular week.
 */
export default function ClassesPage() {
  const db = useDatabase();
  const portal = useStore();
  const nowMs = useNow();
  // "Not here yet" with Remind buttons is Hamza's only (staff have no phone numbers).
  const staff = useIsStaff();
  // Left out of "Not here yet": paused students, and anyone Hamza marked away until a later day.
  const pausedIds = usePausedIds();
  const awayUntil = useMemo(() => awayUntilMap(db), [db]);
  const { toast } = useToast();
  const today = pkDate(nowMs);
  const [picked, setPicked] = useState<string | null>(null);
  // Default to today, or the next class day (the first Monday before term starts).
  const date = picked ?? nextClassDay(today);
  const { links, joins, ready, joinsOk, save, reload } = useClassLinks(date, date, true);

  const [view, setView] = useState<"day" | "week">("day");
  const weekDirty = useRef(false);
  const [leaveWeek, setLeaveWeek] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  // Cancel / move / extra: tell the students in that class (bell note + phone).
  const [tell, setTell] = useState(true);
  // Re-reads the timetable whenever it's saved or loaded.
  const schedule = useSchedule();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slots = useMemo(() => slotsOn(db, date), [db, date, schedule]);
  const off = useMemo(() => archivedCohortIds(db), [db]);
  // In-person students can join online classes but have no register, so they're left off it.
  const students = useMemo(() => db.students.filter((s) => !off.has(s.cohortId) && !isInPersonStudent(db, s)), [db, off]);
  // Who counts for recordings: the same students, without Hamza's own test account.
  const enrolled = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of students) for (const sl of slotsForStudent(db, s, date)) m.set(slotKey(sl), [...(m.get(slotKey(sl)) ?? []), s]);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, students, date, schedule]);

  // A class taught in another class's room shows that room's link and recording.
  const leadOf = (s: DaySlot) => (s.joint?.follows ? (slots.find((x) => x.level === s.joint!.level && x.subject === s.joint!.subject) ?? s) : s);
  const linkFor = (s: DaySlot) => links.find((l) => slotKey(l) === slotKey(leadOf(s))) ?? links.find((l) => slotKey(l) === slotKey(s));
  const live = slots.filter((s) => !s.cancelled);
  // The class to start: live now, or the next one today (from 3 hours before).
  const hero = date === today ? live.find((s) => nowMs < s.endMs && s.startMs - nowMs < 3 * 3_600_000) : undefined;

  async function store(targets: DaySlot[], field: "meetUrl" | "recordingUrl", value: string) {
    if (value.trim() && !looksLikeLink(value)) {
      toast("That doesn't look like a link. Paste the full https:// address.", "error");
      return false;
    }
    const ok = await save(targets, field, value);
    toast(ok ? (value.trim() ? "Link saved." : "Link removed.") : "Couldn't save. Try again.", ok ? "success" : "error");
    return ok;
  }

  // One day change at a time: a double tap must not cancel, move or add twice
  // (each one also messages the students). The ref blocks a second tap in the same frame.
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  // "Mark them absent": asked first, then undoable (toast, or the line left in its place).
  const [absentAsk, setAbsentAsk] = useState<{ level: LevelKey; classId: string; ids: string[]; date: string } | null>(null);
  const [lastAbsent, setLastAbsent] = useState<{ level: LevelKey; count: number; date: string; undo: () => void } | null>(null);

  // A class that was on the timetable (its link was made) but never took place: asked about first.
  const [notHeld, setNotHeld] = useState<{ slot: (typeof slots)[number]; marks: number; lastOfLevel: boolean } | null>(null);

  // The same for a whole day (classes that have started, or any on a past day).
  const started = live.filter((x) => date < today || nowMs >= x.startMs);
  const [noneHeld, setNoneHeld] = useState(false);
  async function markDayNotHeld(todo = started) {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    let done = 0;
    try {
      // One after another: each save carries the whole timetable.
      for (const x of todo) {
        await saveDayChange({ date, level: x.level, subject: x.subject, change: x.extra ? { extra: true, cancelled: true, start: x.start, end: x.end } : { cancelled: true }, notify: false });
        done++;
      }
      // A level's register goes only when none of its classes is left standing that day.
      const standing = new Set(live.filter((x) => !todo.includes(x)).map((x) => x.classId));
      let cleared = 0;
      for (const classId of new Set(todo.map((x) => x.classId))) if (!standing.has(classId)) cleared += portal.clearAttendanceDay(classId, date);
      toast(`${done} classes marked as not held.${cleared ? ` ${cleared === 1 ? "1 register mark" : `${cleared} register marks`} removed.` : ""}`, "success");
    } catch (e) {
      toast(`${done} of ${todo.length} marked as not held, then it stopped. ${e instanceof Error ? e.message : "Try again."}`, "error");
    } finally {
      workingRef.current = false;
      setWorking(false);
      setNoneHeld(false);
      setNotHeld(null);
    }
  }

  // "Extra classes": the window is open for this date (null: closed).
  const [extraFor, setExtraFor] = useState<string | null>(null);
  /**
   * Extra classes on one date, one save after another. A class that is already on
   * that day's timetable moves to the new time; any other is added as an extra.
   */
  async function setUpMakeUp(day: string, list: Array<{ level: LevelKey; subject: SubjectKey; start: string; end: string }>) {
    if (workingRef.current || !list.length) return;
    workingRef.current = true;
    setWorking(true);
    let done = 0;
    try {
      const usual = slotsOn(db, day).filter((x) => !x.extra);
      for (const x of list) {
        const regular = usual.some((u) => u.level === x.level && u.subject === x.subject);
        await saveDayChange({ date: day, level: x.level, subject: x.subject, change: regular ? { start: x.start, end: x.end } : { extra: true, start: x.start, end: x.end }, notify: false });
        done++;
      }
      setExtraFor(null);
      setPicked(day);
      toast(`${done} classes set for ${dateLabel(day, "short")}. Students see them on Home with the Join button.`, "success");
    } catch (e) {
      toast(`${done} of ${list.length} set up, then it stopped. ${e instanceof Error ? e.message : "Try again."}`, "error");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  /** Change one class on this date only (cancel, move, extra), or undo that change. True when saved. */
  async function changeDay(level: LevelKey, subject: SubjectKey, change: Omit<Exception, "date" | "level" | "subject"> | null, done: string, quiet = false) {
    if (workingRef.current) return false;
    // A cleared time box gives "": that would save and tell students "12:NaN".
    if (change?.start !== undefined && !(isTime(change.start) && isTime(change.end) && change.start < change.end)) {
      toast("Fill in both times, with the end after the start.", "error");
      return false;
    }
    const notify = !quiet && tell && date >= today;
    workingRef.current = true;
    setWorking(true);
    try {
      await saveDayChange({ date, level, subject, change, notify });
      setOpenRow(null);
      toast(notify ? `${done} Students in it have been told.` : done, "success");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
      return false;
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  /**
   * Two classes in one room for this date: both move to the same time, the
   * later one sits in the earlier one's room, and the classes after them can
   * slide to close (or make) the gap. One save after another.
   */
  async function teachTogether(a: DaySlot, b: DaySlot, start: string, end: string, slide: Array<{ slot: DaySlot; start: string; end: string }>) {
    if (workingRef.current) return false;
    const [lead, other] = a.start <= b.start ? [a, b] : [b, a];
    const notify = tell && date >= today;
    workingRef.current = true;
    setWorking(true);
    let done = 0;
    const total = 2 + slide.length;
    try {
      const x = (sl: DaySlot) => (sl.extra ? { extra: true } : {});
      await saveDayChange({ date, level: lead.level, subject: lead.subject, change: { start, end, ...x(lead), joint: { level: other.level, subject: other.subject, lead: true } }, notify });
      done++;
      await saveDayChange({ date, level: other.level, subject: other.subject, change: { start, end, ...x(other), joint: { level: lead.level, subject: lead.subject } }, notify });
      done++;
      for (const m of slide) {
        await saveDayChange({ date, level: m.slot.level, subject: m.slot.subject, change: { start: m.start, end: m.end, ...x(m.slot) }, notify });
        done++;
      }
      setOpenRow(null);
      void reload();
      toast(
        `${jointLabel(lead.level, other.level)} ${lead.subject} is one class at ${clock(start)}, on one link.${slide.length ? ` ${slide.length === 1 ? "1 later class" : `${slide.length} later classes`} moved.` : ""}${notify ? " Students have been told." : ""}`,
        "success",
      );
      return true;
    } catch (e) {
      toast(`${done} of ${total} changes saved, then it stopped. ${e instanceof Error ? e.message : "Try again."}`, "error");
      return false;
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  /** Undo "Teach together": both classes go back to their usual times and their own rooms. */
  // Classes moved for this day that come after the pair (most likely slid when they were joined): asked about in the portal's own dialog.
  const [apartAsk, setApartAsk] = useState<{ slot: DaySlot; moved: DaySlot[] } | null>(null);
  function teachApart(s: DaySlot) {
    if (workingRef.current) return;
    const mate = slots.find((x) => x.level === s.joint?.level && x.subject === s.joint?.subject);
    const pair = mate ? [s, mate] : [s];
    const moved = live.filter((x) => !pair.includes(x) && x.changed && !x.extra && !x.joint && x.start >= s.end);
    if (moved.length) return setApartAsk({ slot: s, moved });
    void splitApart(s, []);
  }
  async function splitApart(s: DaySlot, back: DaySlot[]) {
    if (workingRef.current) return;
    const mate = slots.find((x) => x.level === s.joint?.level && x.subject === s.joint?.subject);
    const pair = mate ? [s, mate] : [s];
    const notify = tell && date >= today;
    workingRef.current = true;
    setWorking(true);
    try {
      // The one that leads goes last, so the room is never left without its owner mid-way.
      for (const p of pair.toSorted((m, n) => Number(n.joint?.follows ?? false) - Number(m.joint?.follows ?? false)))
        await saveDayChange({ date, level: p.level, subject: p.subject, change: p.extra ? { extra: true, start: p.start, end: p.end } : null, notify });
      for (const p of back) await saveDayChange({ date, level: p.level, subject: p.subject, change: null, notify });
      setOpenRow(null);
      void reload();
      toast(`Back to separate classes at their usual times.${notify ? " Students have been told." : ""}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  // After a level's last class: students in it who joined none of its classes
  // and have no mark yet. One tap marks them absent.
  const noShows = (["A2", "O", "AS"] as LevelKey[]).flatMap((level) => {
    const block = live.filter((s) => s.level === level);
    if (!block.length || nowMs < block[block.length - 1].endMs) return [];
    const joined = new Set(joins.filter((j) => j.classId === block[0].classId).map((j) => j.studentId));
    if (!joined.size) return [];
    const who = [...new Set(block.flatMap((s) => enrolled.get(slotKey(s)) ?? []))].filter(
      // Hamza's own test account is never offered for "mark absent".
      (st) =>
        !joined.has(st.id) &&
        !isTestAccount(st) &&
        !db.attendanceDays.some((a) => a.studentId === st.id && a.date === date) &&
        // Joined the portal after that day's classes started: not absent from them.
        canBeSwept(st, date, block.filter((s) => (enrolled.get(slotKey(s)) ?? []).some((x) => x.id === st.id)).map((s) => s.startMs)),
    );
    return who.length ? [{ level, classId: block[0].classId, who }] : [];
  });

  const step = (dir: 1 | -1) => {
    let d = addDays(date, dir);
    for (let i = 0; i < 7 && !isClassDay(d) && d >= getSchedule().termStarts; i++) d = addDays(d, dir);
    setPicked(d);
    setOpenRow(null);
  };
  const dayName = dateLabel(date, "long");

  return (
    // The console's one page width and edge; the timetable keeps its narrower, easy to scan column.
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 *:max-w-3xl">
      <PageHeader
        title="Classes"
        subtitle="Today's classes and the weekly timetable."
        actions={
          <Button variant="secondary" onClick={() => setExtraFor(date >= today ? date : today)}>
            <Icon.Plus className="h-4 w-4" /> Extra classes
          </Button>
        }
      />
      <ExtraClassesSheet key={extraFor ?? "closed"} date={extraFor} today={today} busy={working} onClose={() => setExtraFor(null)} onApply={setUpMakeUp} />

      <div className={cn(segmentGroup, "mb-6")}>
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (v === "day" && weekDirty.current) return setLeaveWeek(true);
              if (v === "day") weekDirty.current = false;
              setView(v);
            }}
            aria-pressed={view === v}
            className={segmentItem(view === v)}
          >
            {v === "day" ? "Day" : "Weekly timetable"}
          </button>
        ))}
      </div>

      {view === "week" ? (
        <TimetableEditor onDirtyChange={(d) => (weekDirty.current = d)} />
      ) : (
        <>
          {hero && <StartCard slot={hero} url={linkFor(hero)?.meetUrl ?? null} nowMs={nowMs} />}

          <div className="mb-3 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous class day">
              <Icon.ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              {/* Tap the date to jump to any day (e.g. to add a weekend revision class). */}
              <label className="relative inline-block cursor-pointer text-base font-semibold text-ink underline-offset-4 hover:underline">
                {dayName}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setPicked(e.target.value)}
                  // A laptop click on the hidden box doesn't open the calendar on its own.
                  onClick={openPicker}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick a day"
                />
              </label>
              {date !== today ? (
                <button type="button" onClick={() => setPicked(today)} className="mx-auto block text-sm font-semibold text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">
                  Back to today
                </button>
              ) : (
                <p className="text-sm text-ink-3">Today</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next class day">
              <Icon.ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {!slots.length ? (
            date >= today && date >= getSchedule().termStarts ? (
              <Card className="flex flex-col items-center gap-3 p-5 text-center sm:p-6">
                <p className="text-base text-ink-2">No classes on this day.</p>
                <Button size="sm" variant="secondary" onClick={() => setExtraFor(date)}>
                  Set up classes on this day
                </Button>
              </Card>
            ) : (
              <Card className="p-5 text-center text-base text-ink-2 sm:p-6">
                {date < getSchedule().termStarts
                  ? `Classes start on ${dateLabel(getSchedule().termStarts, "long")}.`
                  : "No classes on this day."}
              </Card>
            )
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-hairline">
                {slots.map((s) => {
                  const key = slotKey(s);
                  const link = linkFor(s);
                  // Students only: Hamza's test account and in-person students neither count nor add to the total, and a second Join tap is one student.
                  const who = (enrolled.get(key) ?? []).filter((w) => !isTestAccount(w));
                  const joined = new Set(joins.filter((j) => slotKey(j) === key && who.some((w) => w.id === j.studentId)).map((j) => j.studentId)).size;
                  const phase = nowMs < s.startMs ? "later" : nowMs < s.endMs ? "live" : "done";
                  const isOpen = openRow === key;
                  return (
                    <li key={key} className={cn(s.cancelled && "opacity-60")}>
                      <div className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                        <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-ink">{timeLabel(s.start)}</span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block break-words text-base font-semibold text-ink", s.cancelled && "line-through")}>
                            {s.subject} <span className="font-normal text-ink-3">· {levelName(s)}</span>
                          </span>
                          <span className="block text-sm text-ink-3">
                            {s.cancelled
                              ? "Cancelled for this day"
                              : phase === "live" && date === today
                                ? `Live now · ${joined} of ${who.length} joined`
                                : phase === "done" || date < today
                                  ? `${who.length ? `${joined} of ${who.length} joined` : "No students in this level"}${link?.recordingUrl ? " · recording ready" : ""}`
                                  : `Until ${clock(s.end)}${s.joint ? ` · ${LEVEL_LABEL[s.level]} students` : s.extra ? " · extra class" : s.changed ? " · changed for this day" : ""}${link?.meetUrl ? " · link ready" : ""}`}
                          </span>
                        </span>
                        {phase === "live" && date === today && !s.cancelled && link?.meetUrl && (
                          <a href={link.meetUrl} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary", size: "sm", className: "max-sm:hidden" })}>
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenRow(isOpen ? null : key)}
                          aria-expanded={isOpen}
                          className={buttonClasses({ variant: "ghost", size: "sm", className: "shrink-0" })}
                        >
                          {isOpen ? "Close" : "More"}
                        </button>
                      </div>
                      {/* Five minutes in: who isn't here yet, each with a ready WhatsApp. A nudge now turns an absence into a late.
                          Hamza only; in-person students are already left out of this class list. */}
                      {!staff && ready === true && joinsOk && phase === "live" && date === today && !s.cancelled && nowMs - s.startMs >= 5 * 60_000 && (() => {
                        // Only once the joins were really read: after a failed read everyone would look absent.
                        const notYet = who.filter(
                          (w) => !isTestAccount(w) && !pausedIds.has(w.id) && (awayUntil.get(w.id) ?? "") < today && !joins.some((j) => slotKey(j) === key && j.studentId === w.id),
                        );
                        if (!notYet.length) return null;
                        return (
                          <div className="flex flex-wrap items-center gap-2 px-5 pb-3.5 sm:px-6">
                            <span className="text-sm text-ink-3">Not here yet:</span>
                            {notYet.map((w) => {
                              const href = w.phone
                                ? `https://wa.me/${w.phone.replace(/\D/g, "")}?text=${encodeURIComponent(studentClassStarted({ id: w.id, username: w.username, subject: s.subject }))}`
                                : null;
                              return href ? (
                                <a key={w.id} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full border border-border-strong px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-3 hover:bg-surface-2 max-md:min-h-11">
                                  Remind {displayName(w.username)}
                                </a>
                              ) : (
                                <span key={w.id} className="inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3 text-sm text-ink-3 max-md:min-h-11" title="No number saved">
                                  {displayName(w.username)}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                      {isOpen && (
                        <div className="space-y-3 border-t border-hairline bg-surface-2/40 px-5 py-4 sm:px-6">
                          {(s.cancelled || phase === "later") && date >= today && (
                            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2 md:min-h-0">
                              <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
                              Tell the students in this class if I change it
                            </label>
                          )}
                          {s.cancelled ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={working}
                              onClick={() =>
                                void changeDay(s.level, s.subject, s.extra ? { extra: true, start: s.start, end: s.end } : null, "Class is back on.")
                              }
                            >
                              Put this class back on
                            </Button>
                          ) : (
                            <>
                              {s.joint && (
                                <p className="text-sm text-ink-2">
                                  Taught together with {LEVEL_LABEL[s.joint.level]} {s.joint.subject} for this day: one link, one recording, a register for each level.
                                  {phase === "later" && (
                                    <>
                                      {" "}
                                      <button type="button" disabled={working} className="font-semibold text-ink underline underline-offset-4 disabled:opacity-50" onClick={() => teachApart(s)}>
                                        Teach them separately
                                      </button>
                                    </>
                                  )}
                                </p>
                              )}
                              {phase === "later" && (
                                <DayActions
                                  slot={s}
                                  day={live}
                                  onJoin={(mate, start, end, slide) => teachTogether(s, mate, start, end, slide)}
                                  tell={tell}
                                  busy={working}
                                  onCancel={() =>
                                    changeDay(
                                      s.level,
                                      s.subject,
                                      s.extra ? { extra: true, cancelled: true, start: s.start, end: s.end } : { cancelled: true },
                                      `${s.subject} cancelled for this day.`,
                                    )
                                  }
                                  onMove={(start, end) =>
                                    changeDay(s.level, s.subject, { start, end, ...(s.extra ? { extra: true } : {}) }, `${s.subject} moved to ${clock(start)} for this day.`)
                                  }
                                />
                              )}
                              {phase !== "later" && date <= today && (
                                <div>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={working}
                                    onClick={() =>
                                      setNotHeld({
                                        slot: s,
                                        marks: db.attendanceDays.filter((a) => a.classId === s.classId && a.date === date).length,
                                        lastOfLevel: !live.some((x) => x.level === s.level && slotKey(x) !== key),
                                      })
                                    }
                                  >
                                    This class didn&apos;t happen
                                  </Button>
                                </div>
                              )}
                              <div data-owner>
                                <Link
                                  href={`/admin/assignments?set=papers&class=${s.classId}&subject=${s.subjectId}`}
                                  className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline max-md:h-11"
                                >
                                  <Icon.Plus className="h-4 w-4" /> Set homework for this class
                                </Link>
                              </div>
                              <LinkField
                                key={`m-${key}-${link?.meetUrl ?? ""}`}
                                label="Meet link"
                                note={s.joint ? "Shared by both classes." : undefined}
                                placeholder="Paste the Meet link"
                                initial={link?.meetUrl ?? ""}
                                disabled={ready === false}
                                onSave={(v) => store(s.joint ? [leadOf(s), ...slots.filter((x) => x.joint?.follows && leadOf(x) === leadOf(s))] : [s], "meetUrl", v)}
                              />
                              {(phase === "done" || date < today) && (
                                <LinkField
                                  key={`r-${key}-${link?.recordingUrl ?? ""}`}
                                  label="Recording"
                                  placeholder="Added automatically, or paste a Drive link"
                                  initial={link?.recordingUrl ?? ""}
                                  disabled={ready === false}
                                  onSave={(v) => store([s], "recordingUrl", v)}
                                />
                              )}
                              {phase !== "later" && who.length > joined && joined > 0 && (
                                <p className="text-sm text-ink-3">
                                  Not joined:{" "}
                                  {who
                                    .filter((w) => !isTestAccount(w) && !joins.some((j) => slotKey(j) === key && j.studentId === w.id))
                                    .map((m) => displayName(m.username))
                                    .join(", ")}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {noShows.map((n) => (
            <div key={n.level} className={cn(panel, "mt-3 flex flex-wrap items-center justify-between gap-3 px-5 py-3")}>
              <p className="text-base text-ink-2">
                {LEVEL_LABEL[n.level]}: {n.who.length === 1 ? "1 student" : `${n.who.length} students`} didn&apos;t join any class today.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAbsentAsk({ level: n.level, classId: n.classId, ids: n.who.map((st) => st.id), date })}
              >
                Mark them absent
              </Button>
            </div>
          ))}

          {lastAbsent && lastAbsent.date === date && (
            <div className={cn(panel, "mt-3 flex flex-wrap items-center justify-between gap-3 px-5 py-3")} role="status">
              <p className="text-base text-ink-2">
                {LEVEL_LABEL[lastAbsent.level]}: {lastAbsent.count === 1 ? "1 student" : `${lastAbsent.count} students`} marked absent.
              </p>
              <Button variant="secondary" size="sm" onClick={lastAbsent.undo}>
                Undo
              </Button>
            </div>
          )}

          {date <= today && started.length > 1 && (
            <button
              type="button"
              disabled={working}
              onClick={() => setNoneHeld(true)}
              className="mt-4 block h-10 text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline max-md:h-11"
            >
              None of these classes happened
            </button>
          )}
          {date >= today && (
            <ExtraClass
              date={date}
              busy={working}
              onAdd={async (level, subject, start, end) => {
                // One class per level and subject per day: an existing one is moved instead.
                const same = slots.find((x) => x.level === level && x.subject === subject);
                if (same && !same.cancelled) {
                  toast(`${LEVEL_LABEL[level]} ${subject} is already on this day. Use More, then Change time, instead.`, "error");
                  return false;
                }
                // The regular class is cancelled today: one change per class and day, so
                // this replaces the cancel with the new time (an "extra" here would just
                // bring the regular time back).
                const change = same && !same.extra ? { start, end } : { extra: true, start, end };
                return changeDay(level, subject, change, `Extra ${subject} class added.`);
              }}
            />
          )}
        </>
      )}

      {/* Setup sits quietly under the classes: the day's classes come first. */}
      {/* Owner only: the Google check is Hamza's, and staff would only ever see its error card. */}
      {!staff && <GoogleConnect onSynced={() => void reload()} />}

      <Modal
        open={!!apartAsk}
        onClose={() => setApartAsk(null)}
        title="Put the later classes back too?"
        description={apartAsk ? `${apartAsk.moved.map((x) => `${x.subject} · ${LEVEL_LABEL[x.level]}`).join(" and ")} ${apartAsk.moved.length === 1 ? "was" : "were"} moved for this day.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { const a = apartAsk; setApartAsk(null); if (a) void splitApart(a.slot, []); }}>
              Leave {apartAsk?.moved.length === 1 ? "it" : "them"}
            </Button>
            <Button onClick={() => { const a = apartAsk; setApartAsk(null); if (a) void splitApart(a.slot, a.moved); }}>
              Put {apartAsk?.moved.length === 1 ? "it" : "them"} back
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Both joined classes go back to their usual times and their own links either way.</p>
      </Modal>

      <Modal
        open={leaveWeek}
        onClose={() => setLeaveWeek(false)}
        title="Leave without saving?"
        description="Your timetable changes aren't saved yet."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveWeek(false)}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={() => {
                setLeaveWeek(false);
                weekDirty.current = false;
                setView("day");
              }}
            >
              Leave them
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Day changes save straight away; the weekly timetable only saves when you press Save timetable.</p>
      </Modal>

      <Modal
        open={noneHeld}
        onClose={() => setNoneHeld(false)}
        title="None of these classes happened?"
        description={`All ${started.length} classes will show as cancelled for this day. Students are not sent a message.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoneHeld(false)}>Keep them</Button>
            <Button variant="danger" loading={working} onClick={() => void markDayNotHeld(started)}>
              None happened
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Any register marks for these classes on this day are removed, so nobody is counted present or absent.</p>
        <p className="mt-2 text-sm text-ink-3">You can put a class back on afterwards, but removed register marks do not come back.</p>
      </Modal>

      <Modal
        open={!!notHeld}
        onClose={() => setNotHeld(null)}
        title={notHeld ? `${notHeld.slot.subject} didn't happen?` : ""}
        description={notHeld ? "Choose how much of this day didn't happen. It will show as cancelled, and students are not sent a message." : ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotHeld(null)}>Keep it</Button>
            <Button
              variant="danger"
              loading={working}
              onClick={async () => {
                if (!notHeld) return;
                const { slot: s, lastOfLevel } = notHeld;
                const ok = await changeDay(
                  s.level,
                  s.subject,
                  s.extra ? { extra: true, cancelled: true, start: s.start, end: s.end } : { cancelled: true },
                  `${s.subject} marked as not held.`,
                  true,
                );
                setNotHeld(null);
                if (!ok || !lastOfLevel) return;
                const cleared = portal.clearAttendanceDay(s.classId, date);
                if (cleared) toast(`${cleared === 1 ? "1 register mark" : `${cleared} register marks`} removed for that day.`, "success");
              }}
            >
              Just this class
            </Button>
            {notHeld && started.filter((x) => x.level === notHeld.slot.level).length > 1 && (
              <Button variant="danger" disabled={working} onClick={() => void markDayNotHeld(started.filter((x) => x.level === notHeld.slot.level))}>
                All {LEVEL_LABEL[notHeld.slot.level]} classes
              </Button>
            )}
            {started.length > 1 && (
              <Button variant="danger" disabled={working} onClick={() => void markDayNotHeld(started)}>
                The whole day
              </Button>
            )}
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Register marks for a level are removed once none of its classes is left standing that day, so nobody is counted present or absent.
        </p>
        <p className="mt-2 text-sm text-ink-3">You can put the class back on afterwards, but removed register marks do not come back.</p>
      </Modal>

      <Modal
        open={!!absentAsk}
        onClose={() => setAbsentAsk(null)}
        title={absentAsk ? `Mark ${absentAsk.ids.length === 1 ? "1 student" : `${absentAsk.ids.length} students`} absent?` : ""}
        description={
          absentAsk
            ? `${LEVEL_LABEL[absentAsk.level]} students who didn't join any class on ${new Date(`${absentAsk.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long" })} will be marked absent.`
            : ""
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAbsentAsk(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!absentAsk) return;
                const { level, classId, ids, date: day } = absentAsk;
                setAbsentAsk(null);
                const undoMarks = portal.markAttendanceMany(ids, classId, day, "absent");
                let undone = false;
                const undo = () => {
                  if (undone) return;
                  undone = true;
                  const back = undoMarks();
                  setLastAbsent(null);
                  toast(back === ids.length ? `${back} put back to not marked.` : `${back} put back to not marked. ${ids.length - back} changed by hand since stay as they are.`, "success");
                };
                setLastAbsent({ level, count: ids.length, date: day, undo });
                toast(`Marked ${ids.length} absent. Change any in Attendance.`, "success", { label: "Undo", onClick: undo });
              }}
            >
              {absentAsk ? `Mark ${absentAsk.ids.length} absent` : "Mark absent"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">You can undo this straight after.</p>
      </Modal>
    </div>
  );
}

/** "Monday 3 November" for a Pakistan date, the same on any phone's time zone. */
function dateLabel(ymd: string, style: "long" | "short") {
  return new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: style, day: "numeric", month: style, timeZone: "Asia/Karachi" });
}

function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker();
  } catch {
    // Older browsers open it themselves, or not at all; the arrows still work.
  }
}

/** Inputs: 16px on phones so iOS doesn't zoom in, 44px tall on touch. */
const touchField = "max-md:text-base pointer-coarse:h-11";

function nextClassDay(today: string) {
  let d = today < getSchedule().termStarts ? getSchedule().termStarts : today;
  for (let i = 0; i < 7 && !isClassDay(d); i++) d = addDays(d, 1);
  return d;
}

/** A link box that saves itself on paste, Enter or leaving the field. */
function LinkField({
  label,
  note,
  placeholder,
  initial,
  disabled,
  onSave,
}: {
  label: string;
  /** A short line under the box (a long label would wrap in its narrow column on a phone). */
  note?: string;
  placeholder: string;
  initial: string;
  disabled?: boolean;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  // The value being saved right now: a paste followed by leaving the box must not save it twice.
  const pending = useRef<string | null>(null);
  const commit = async (raw: string) => {
    // A pasted WhatsApp line or a bare meet.google.com/... becomes the link itself.
    const v = raw.trim() ? tidyLink(raw) : "";
    if (v !== raw) setValue(v);
    if (v === saved.trim() || v === pending.current) return;
    pending.current = v;
    try {
      if (await onSave(v)) setSaved(v);
    } finally {
      pending.current = null;
    }
  };
  return (
    <div>
    <div className="flex items-center gap-2">
      <span className="label-quiet w-20 shrink-0 text-ink-3">{label}</span>
      <input
        type="url"
        inputMode="url"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const v = e.clipboardData.getData("text").trim();
          if (!v) return;
          e.preventDefault();
          void commit(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && void commit(value)}
        onBlur={() => void commit(value)}
        className={cn(
          "h-10 min-w-0 flex-1 rounded-field border border-field bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-ink-2",
          touchField,
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60",
        )}
      />
      {saved && (
        <a
          href={saved}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11 pointer-coarse:w-11"
          aria-label={`Open ${label.toLowerCase()}`}
        >
          <Icon.ChevronRight className="h-4 w-4" />
        </a>
      )}
    </div>
    {note && <p className="mt-1 pl-[5.5rem] text-xs text-ink-3">{note}</p>}
    </div>
  );
}

/** "Cancel this day" / "Change time" for one class on one date. */
function DayActions({
  slot,
  tell,
  busy,
  onCancel,
  onMove,
  day,
  onJoin,
}: {
  slot: DaySlot;
  tell: boolean;
  busy: boolean;
  onCancel: () => Promise<boolean>;
  onMove: (start: string, end: string) => Promise<boolean>;
  /** Every class that is on this day (for "Teach together"). */
  day: DaySlot[];
  onJoin: (mate: DaySlot, start: string, end: string, slide: Array<{ slot: DaySlot; start: string; end: string }>) => Promise<boolean>;
}) {
  const [moving, setMoving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  const small = "h-10 rounded-full px-3.5 text-sm font-semibold transition-colors pointer-coarse:h-11 pointer-coarse:px-4 disabled:opacity-50";
  const timeBox = cn("h-10 rounded-field border border-field bg-surface px-2.5 text-sm tabular-nums text-ink", touchField);
  const valid = isTime(start) && isTime(end) && start < end;
  if (moving)
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={timeBox} aria-label="New start" aria-invalid={!isTime(start)} />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={timeBox} aria-label="New end" aria-invalid={!isTime(end) || !(start < end)} />
        {/* Stays open if the save fails, so the new times aren't lost. */}
        <button
          type="button"
          disabled={!valid || busy}
          aria-busy={busy}
          className={buttonClasses({ size: "sm" })}
          onClick={() => void onMove(start, end).then((ok) => ok && setMoving(false))}
        >
          {busy ? "Saving" : "Save"}
        </button>
        <button type="button" disabled={busy} className={`${small} text-ink-3 hover:text-ink`} onClick={() => setMoving(false)}>
          Cancel
        </button>
      </span>
    );
  if (joining) return <TeachTogether slot={slot} day={day} busy={busy} onJoin={onJoin} onClose={() => setJoining(false)} />;
  const mates = !slot.joint && day.some((x) => x.level !== slot.level && !x.joint);
  return (
    <span className="flex flex-wrap items-center">
      <button type="button" disabled={busy} className={`${small} text-ink-3 hover:bg-surface-2 hover:text-ink`} onClick={() => setMoving(true)}>
        Change time
      </button>
      {mates && (
        <button type="button" disabled={busy} className={`${small} text-ink-3 hover:bg-surface-2 hover:text-ink`} onClick={() => setJoining(true)}>
          Teach together
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        className={`${small} text-ink-3 hover:bg-surface-2 hover:text-error`}
        onClick={() => setCancelAsk(true)}
      >
        {busy ? "Saving" : "Cancel class"}
      </button>
      <Modal
        open={cancelAsk}
        onClose={() => setCancelAsk(false)}
        title={`Cancel ${slot.subject} for this day?`}
        description={tell ? "Students in it will be told." : "Students won't get a message (the box is unticked)."}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelAsk(false)}>Keep the class</Button>
            <Button
              variant="danger"
              onClick={() => {
                setCancelAsk(false);
                void onCancel();
              }}
            >
              Cancel class
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">It stays on the list, and More then shows Put this class back on.</p>
      </Modal>
    </span>
  );
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * "Teach together": this class and one from another level in one room for this
 * date. Pick the other class and the time; the classes after them can slide so
 * the evening stays back to back. Nothing is saved until "Teach together" is pressed.
 */
function TeachTogether({
  slot,
  day,
  busy,
  onJoin,
  onClose,
}: {
  slot: DaySlot;
  day: DaySlot[];
  busy: boolean;
  onJoin: (mate: DaySlot, start: string, end: string, slide: Array<{ slot: DaySlot; start: string; end: string }>) => Promise<boolean>;
  onClose: () => void;
}) {
  const options = day.filter((x) => x.level !== slot.level && !x.joint);
  // The same subject at another level first, the one nearest in time: that is the usual pair.
  const [mateKey, setMateKey] = useState(() => {
    const near = (list: DaySlot[]) => list.toSorted((m, n) => Math.abs(m.startMs - slot.startMs) - Math.abs(n.startMs - slot.startMs))[0];
    return slotKey(near(options.filter((x) => x.subject === slot.subject)) ?? near(options));
  });
  const mate = options.find((x) => slotKey(x) === mateKey) ?? options[0];
  const first = slot.start <= mate.start ? slot.start : mate.start;
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(toTime(Math.min(toMin(first) + 60, 23 * 60 + 59)));
  const [slideOn, setSlideOn] = useState(true);
  const pick = (k: string) => {
    const m = options.find((x) => slotKey(x) === k) ?? options[0];
    const f = slot.start <= m.start ? slot.start : m.start;
    setMateKey(k);
    setStart(f);
    setEnd(toTime(Math.min(toMin(f) + 60, 23 * 60 + 59)));
  };
  const valid = isTime(start) && isTime(end) && start < end;
  // The classes after the pair, and how far they would slide to stay back to back.
  // Measured from the first class after them, so joining twice never slides anything twice.
  const after = valid ? day.filter((x) => x !== slot && x !== mate && x.start > start).toSorted((m, n) => m.start.localeCompare(n.start)) : [];
  const shift = after.length ? toMin(end) - toMin(after[0].start) : 0;
  const canSlide = shift !== 0 && after.length > 0 && after.every((x) => toMin(x.start) + shift >= 0 && toMin(x.end) + shift < 24 * 60);
  const slide = canSlide && slideOn ? after.map((x) => ({ slot: x, start: toTime(toMin(x.start) + shift), end: toTime(toMin(x.end) + shift) })) : [];
  // Anything else still sitting on top of the joint class once that is done.
  const clash = valid
    ? day.filter((x) => {
        if (x === slot || x === mate) return false;
        const m = slide.find((y) => y.slot === x);
        return (m?.start ?? x.start) < end && (m?.end ?? x.end) > start;
      })
    : [];
  const field = cn("h-10 rounded-field border border-field bg-surface px-2.5 text-sm text-ink", touchField);
  const small = "h-10 rounded-full px-3.5 text-sm font-semibold transition-colors pointer-coarse:h-11 pointer-coarse:px-4 disabled:opacity-50";
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">
        Teach {slot.subject} · {LEVEL_LABEL[slot.level]} together with
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={mateKey} onChange={(e) => pick(e.target.value)} className={field} aria-label="The other class">
          {options.map((x) => (
            <option key={slotKey(x)} value={slotKey(x)}>
              {x.subject} · {LEVEL_LABEL[x.level]} ({timeLabel(x.start)})
            </option>
          ))}
        </select>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={cn(field, "tabular-nums")} aria-label="Start" aria-invalid={!isTime(start)} />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={cn(field, "tabular-nums")} aria-label="End" aria-invalid={!isTime(end) || !(start < end)} />
      </div>
      <p className="text-sm text-ink-3">Both classes share one Meet link and one recording for this day. Each level keeps its own register, tests and homework.</p>
      {canSlide && (
        <label className="flex min-h-11 items-start gap-2 text-sm text-ink-2 md:min-h-0">
          <input type="checkbox" checked={slideOn} onChange={(e) => setSlideOn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
          <span>
            Move the {after.length === 1 ? "class" : `${after.length} classes`} after this {Math.abs(shift)} minutes {shift < 0 ? "earlier" : "later"}:{" "}
            {after.map((x) => `${x.subject} · ${LEVEL_LABEL[x.level]} at ${clock(toTime(toMin(x.start) + shift))}`).join(", ")}
          </span>
        </label>
      )}
      {clash.length > 0 && (
        <p className="text-sm text-warning">
          {clash.map((x) => `${x.subject} · ${LEVEL_LABEL[x.level]}`).join(", ")} would be at the same time as this. Change {clash.length === 1 ? "its" : "their"} time too, or pick another time.
        </p>
      )}
      <span className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={!valid || busy} aria-busy={busy} className={buttonClasses({ size: "sm" })} onClick={() => void onJoin(mate, start, end, slide).then((ok) => ok && onClose())}>
          {busy ? "Saving" : "Teach together"}
        </button>
        <button type="button" disabled={busy} className={`${small} text-ink-3 hover:text-ink`} onClick={onClose}>
          Cancel
        </button>
      </span>
    </div>
  );
}

/** One-off class on this date (a make-up or revision class). */

/**
 * Extra classes on any date (a Saturday make-up, a swapped day): the usual
 * classes, level by level, in their usual order and length. Pick the date,
 * leave a level out, or start a level at another time. The weekly timetable
 * is never changed.
 */
function ExtraClassesSheet({
  date: initial,
  today,
  busy,
  onClose,
  onApply,
}: {
  date: string | null;
  today: string;
  busy: boolean;
  onClose: () => void;
  onApply: (date: string, list: Array<{ level: LevelKey; subject: SubjectKey; start: string; end: string }>) => Promise<void>;
}) {
  const levels = useMemo(() => {
    const by = new Map<LevelKey, Array<{ subject: SubjectKey; start: string; end: string }>>();
    for (const sl of getSchedule().slots.toSorted((a, b) => a.start.localeCompare(b.start)))
      if (!(by.get(sl.level) ?? []).some((x) => x.subject === sl.subject)) by.set(sl.level, [...(by.get(sl.level) ?? []), { subject: sl.subject, start: sl.start, end: sl.end }]);
    return [...by.entries()].map(([level, list]) => ({ level, list }));
  }, []);
  const [day, setDay] = useState(initial ?? today);
  const [off, setOff] = useState<Set<LevelKey>>(new Set());
  const [starts, setStarts] = useState<Partial<Record<LevelKey, string>>>({});
  const f = cn("h-10 rounded-field border border-field bg-surface px-2.5 text-sm tabular-nums text-ink", touchField);

  const plan = levels.flatMap(({ level, list }) => {
    if (off.has(level) || !list.length) return [];
    const from = starts[level];
    const shift = from && isTime(from) ? toMin(from) - toMin(list[0].start) : 0;
    return list.map((x) => ({ level, subject: x.subject, start: toTime(toMin(x.start) + shift), end: toTime(toMin(x.end) + shift) }));
  });
  const late = plan.some((x) => toMin(x.end) > 24 * 60 || toMin(x.start) < 0);
  const past = !day || day < today;
  const toggle = (level: LevelKey, on: boolean) =>
    setOff((o) => {
      const n = new Set(o);
      if (on) n.delete(level);
      else n.add(level);
      return n;
    });

  return (
    <Modal
      open={!!initial}
      onClose={onClose}
      title="Extra classes"
      description="Your usual classes in their usual order. Pick the day, then change a level's start time or leave a level out."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!plan.length || late || past} onClick={() => void onApply(day, plan)}>
            Set {plan.length} {plan.length === 1 ? "class" : "classes"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Day</span>
          <input type="date" className={cn(f, "w-full max-w-[14rem]")} value={day} min={today} onChange={(e) => setDay(e.target.value)} />
          {day && !past && <span className="mt-1.5 block text-sm text-ink-3">{dateLabel(day, "long")}</span>}
        </label>
        <ul className="divide-y divide-hairline rounded-tile bg-surface-2">
          {levels.map(({ level, list }) => {
            const on = !off.has(level);
            const mine = plan.filter((x) => x.level === level);
            return (
              <li key={level} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-h-11 items-center gap-2.5 text-sm font-semibold text-ink">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={on} onChange={(e) => toggle(level, e.target.checked)} />
                    {LEVEL_LABEL[level]}
                  </label>
                  {on && (
                    <label className="flex items-center gap-2 text-sm text-ink-3">
                      Starts
                      <input
                        type="time"
                        className={f}
                        value={starts[level] ?? list[0]?.start ?? ""}
                        onChange={(e) => setStarts((x) => ({ ...x, [level]: e.target.value }))}
                        aria-label={`${LEVEL_LABEL[level]} starts at`}
                      />
                    </label>
                  )}
                </div>
                {on && <p className="text-sm tabular-nums text-ink-2">{mine.map((x) => `${x.subject} ${clock(x.start)}`).join(" · ")}</p>}
              </li>
            );
          })}
        </ul>
        {late && <p className="text-sm text-error">A level would run past midnight. Choose an earlier start.</p>}
        <p className="text-sm text-ink-3">Students are not messaged. Post an announcement if you want to tell them. The weekly timetable stays as it is.</p>
      </div>
    </Modal>
  );
}

function ExtraClass({
  date,
  busy,
  onAdd,
}: {
  date: string;
  busy: boolean;
  onAdd: (level: LevelKey, subject: SubjectKey, start: string, end: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<LevelKey>("A2");
  const [subject, setSubject] = useState<SubjectKey>("Economics");
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("16:40");
  const f = cn("h-10 rounded-field border border-field bg-surface px-2.5 text-sm text-ink", touchField);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline max-md:h-11">
        <Icon.Plus className="h-4 w-4" /> Add an extra class on this day
      </button>
    );
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-2 p-5 sm:p-6">
      <span className="w-full text-base font-semibold text-ink">
        Extra class on {dateLabel(date, "short")}
      </span>
      <select className={f} value={level} onChange={(e) => setLevel(e.target.value as LevelKey)} aria-label="Level">
        {(["A2", "O", "AS"] as LevelKey[]).map((l) => (
          <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
        ))}
      </select>
      <select className={f} value={subject} onChange={(e) => setSubject(e.target.value as SubjectKey)} aria-label="Subject">
        {(["Economics", "Business", "Accounting"] as SubjectKey[]).map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input type="time" className={f} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Starts" aria-invalid={!isTime(start)} />
      <input type="time" className={f} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Ends" aria-invalid={!isTime(end) || !(start < end)} />
      {/* Closes only once it's saved: a failed add keeps what was picked. */}
      <Button
        size="sm"
        loading={busy}
        disabled={!(isTime(start) && isTime(end) && start < end)}
        onClick={() => void onAdd(level, subject, start, end).then((ok) => ok && setOpen(false))}
      >
        Add
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </Card>
  );
}
