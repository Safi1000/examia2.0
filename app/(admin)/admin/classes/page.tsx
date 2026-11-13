"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { archivedCohortIds, canBeSwept } from "@/lib/data/selectors";
import { isInPersonStudent } from "@/lib/in-person";
import { displayName, isTestAccount } from "@/lib/display-name";
import { PageHeader } from "@/components/admin/PageHeader";
import { GoogleConnect } from "@/components/admin/GoogleConnect";
import { StartCard } from "@/components/admin/StartCard";
import { TimetableEditor } from "@/components/admin/TimetableEditor";
import { saveDayChange } from "@/components/ScheduleGate";
import type { Exception, SubjectKey } from "@/lib/timetable";
import { Button, Card, Icon, Modal, segmentGroup, segmentItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { panel } from "@/components/admin/surface";
import {
  LEVEL_LABEL,
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
  span,
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
  const { toast } = useToast();
  const today = pkDate(nowMs);
  const [picked, setPicked] = useState<string | null>(null);
  // Default to today, or the next class day (the first Monday before term starts).
  const date = picked ?? nextClassDay(today);
  const { links, joins, ready, save, reload } = useClassLinks(date, date, true);

  const [view, setView] = useState<"day" | "week">("day");
  const weekDirty = useRef(false);
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

  const linkFor = (s: DaySlot) => links.find((l) => slotKey(l) === slotKey(s));
  const live = slots.filter((s) => !s.cancelled);
  // The class to start: live now, or the next one today (from 3 hours before).
  const hero = date === today ? live.find((s) => nowMs < s.endMs && s.startMs - nowMs < 3 * 3_600_000) : undefined;

  async function store(targets: DaySlot[], field: "meetUrl" | "recordingUrl", value: string) {
    if (value.trim() && !looksLikeLink(value)) {
      toast("That doesn't look like a link. Paste the full https:// address.", "error");
      return false;
    }
    const ok = await save(targets, field, value);
    toast(ok ? (value.trim() ? "Saved" : "Removed") : "Couldn't save. Try again.", ok ? "success" : "error");
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
      <PageHeader title="Classes" subtitle="Today's classes and the weekly timetable." />

      <div className={cn(segmentGroup, "mb-6")}>
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              if (v === "day" && weekDirty.current && !window.confirm("You have timetable changes that aren't saved. Leave them?")) return;
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
                <button type="button" onClick={() => setPicked(today)} className="mx-auto block text-xs font-semibold text-brand hover:underline">
                  Back to today
                </button>
              ) : (
                <p className="text-xs text-ink-3">Today</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next class day">
              <Icon.ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {!slots.length ? (
            <Card className="p-6 text-center text-sm text-ink-2">
              {date < getSchedule().termStarts
                ? `Classes start on ${dateLabel(getSchedule().termStarts, "long")}.`
                : "No classes on this day."}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-border">
                {slots.map((s) => {
                  const key = slotKey(s);
                  const link = linkFor(s);
                  const who = enrolled.get(key) ?? [];
                  const joined = joins.filter((j) => slotKey(j) === key).length;
                  const phase = nowMs < s.startMs ? "later" : nowMs < s.endMs ? "live" : "done";
                  const isOpen = openRow === key;
                  return (
                    <li key={key} className={cn(s.cancelled && "opacity-60")}>
                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                        <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-ink">{timeLabel(s.start)}</span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate font-semibold text-ink", s.cancelled && "line-through")}>
                            {s.subject} <span className="font-normal text-ink-3">· {LEVEL_LABEL[s.level]}</span>
                          </span>
                          <span className="block text-xs text-ink-3">
                            {s.cancelled
                              ? "Cancelled for this day"
                              : phase === "live" && date === today
                                ? `Live now · ${joined} of ${who.length} joined`
                                : phase === "done" || date < today
                                  ? `${who.length ? `${joined} of ${who.length} joined` : "No students in this level"}${link?.recordingUrl ? " · recording ready" : ""}`
                                  : `${span(s.start, s.end)}${s.extra ? " · extra class" : s.changed ? " · changed for this day" : ""}${link?.meetUrl ? " · link ready" : ""}`}
                          </span>
                        </span>
                        {phase === "live" && date === today && !s.cancelled && link?.meetUrl && (
                          <a href={link.meetUrl} target="_blank" rel="noreferrer" className="hidden h-9 items-center rounded-full bg-brand px-4 text-xs font-semibold text-on-brand sm:inline-flex">
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenRow(isOpen ? null : key)}
                          aria-expanded={isOpen}
                          className="h-9 shrink-0 rounded-full px-3 text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11 pointer-coarse:px-4"
                        >
                          {isOpen ? "Close" : "More"}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="space-y-3 border-t border-border bg-surface-2/40 px-4 py-4 sm:px-5">
                          {(s.cancelled || phase === "later") && date >= today && (
                            <label className="flex min-h-11 items-center gap-2 text-xs text-ink-2 md:min-h-0">
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
                              {phase === "later" && (
                                <DayActions
                                  slot={s}
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
                              <div>
                                <Link
                                  href={`/admin/assignments?set=papers&class=${s.classId}&subject=${s.subjectId}`}
                                  className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand hover:underline max-md:h-11"
                                >
                                  <Icon.Plus className="h-4 w-4" /> Set homework for this class
                                </Link>
                              </div>
                              <LinkField
                                key={`m-${key}-${link?.meetUrl ?? ""}`}
                                label="Meet link"
                                placeholder="Paste the Meet link (made for you if Google is connected)"
                                initial={link?.meetUrl ?? ""}
                                disabled={ready === false}
                                onSave={(v) => store([s], "meetUrl", v)}
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
                                <p className="text-xs text-ink-3">
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
              <p className="text-sm text-ink-2">
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
              <p className="text-sm text-ink-2">
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
      <GoogleConnect onSynced={() => void reload()} />

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
  placeholder,
  initial,
  disabled,
  onSave,
}: {
  label: string;
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
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold text-ink-3">{label}</span>
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
          "h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3",
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
  );
}

/** "Cancel this day" / "Change time" for one class on one date. */
function DayActions({
  slot,
  tell,
  busy,
  onCancel,
  onMove,
}: {
  slot: DaySlot;
  tell: boolean;
  busy: boolean;
  onCancel: () => Promise<boolean>;
  onMove: (start: string, end: string) => Promise<boolean>;
}) {
  const [moving, setMoving] = useState(false);
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  const small = "h-9 rounded-full px-3 text-xs font-semibold transition-colors pointer-coarse:h-11 pointer-coarse:px-4 disabled:opacity-50";
  const timeBox = cn("h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink", touchField);
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
          className={`${small} bg-brand text-on-brand`}
          onClick={() => void onMove(start, end).then((ok) => ok && setMoving(false))}
        >
          {busy ? "Saving" : "Save"}
        </button>
        <button type="button" disabled={busy} className={`${small} text-ink-3 hover:text-ink`} onClick={() => setMoving(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <span className="flex items-center">
      <button type="button" disabled={busy} className={`${small} text-ink-3 hover:bg-surface-2 hover:text-ink`} onClick={() => setMoving(true)}>
        Change time
      </button>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        className={`${small} text-ink-3 hover:bg-surface-2 hover:text-error`}
        onClick={() => {
          if (window.confirm(`Cancel ${slot.subject} for this day?${tell ? " Students in it will be told." : " Students won't get a message (the box is unticked)."}`)) void onCancel();
        }}
      >
        {busy ? "Saving" : "Cancel class"}
      </button>
    </span>
  );
}

/** One-off class on this date (a make-up or revision class). */
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
  const f = cn("h-10 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink", touchField);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
        <Icon.Plus className="h-4 w-4" /> Add an extra class on this day
      </button>
    );
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-2 p-4">
      <span className="w-full text-sm font-semibold text-ink">
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
