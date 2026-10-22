"use client";

import { useMemo, useState } from "react";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { archivedCohortIds } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { PageHeader } from "@/components/admin/PageHeader";
import { GoogleConnect } from "@/components/admin/GoogleConnect";
import { TimetableEditor } from "@/components/admin/TimetableEditor";
import { storeSchedule } from "@/components/ScheduleGate";
import type { Exception, SubjectKey } from "@/lib/timetable";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  LEVEL_LABEL,
  getSchedule,
  addDays,
  isClassDay,
  looksLikeLink,
  pkDate,
  slotKey,
  slotsForStudent,
  slotsOn,
  timeLabel,
  useClassLinks,
  type DaySlot,
  type LevelKey,
} from "@/lib/classes";

/**
 * Hamza's class console: paste each class's Meet link (students get a Join
 * button 10 minutes before), see who joined, and add the recording after.
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
  // Bumped after a timetable change so the day re-reads it.
  const [rev, setRev] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slots = useMemo(() => slotsOn(db, date), [db, date, rev]);
  const off = useMemo(() => archivedCohortIds(db), [db]);
  const students = useMemo(() => db.students.filter((s) => !off.has(s.cohortId)), [db.students, off]);
  const enrolled = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of students) for (const sl of slotsForStudent(db, s, date)) m.set(slotKey(sl), [...(m.get(slotKey(sl)) ?? []), s]);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, students, date, rev]);

  /** Change one class on this date only (cancel, move, extra), or undo that change. */
  async function changeDay(level: LevelKey, subject: SubjectKey, change: Omit<Exception, "date" | "level" | "subject"> | null, done: string) {
    const cur = getSchedule();
    const others = cur.exceptions.filter((e) => !(e.date === date && e.level === level && e.subject === subject));
    try {
      await storeSchedule({ ...cur, exceptions: change ? [...others, { date, level, subject, ...change }] : others });
      setRev((n) => n + 1);
      toast(done, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    }
  }

  const linkFor = (s: DaySlot) => links.find((l) => slotKey(l) === slotKey(s));
  const levels = (["A2", "O", "AS"] as LevelKey[]).filter((l) => slots.some((s) => s.level === l));

  async function store(targets: DaySlot[], field: "meetUrl" | "recordingUrl", value: string) {
    if (value.trim() && !looksLikeLink(value)) {
      toast("That doesn't look like a link. Paste the full https:// address.", "error");
      return false;
    }
    const ok = await save(targets, field, value);
    toast(ok ? (value.trim() ? "Saved" : "Removed") : "Couldn't save. Try again.", ok ? "success" : "error");
    return ok;
  }

  const step = (dir: 1 | -1) => {
    let d = addDays(date, dir);
    for (let i = 0; i < 7 && !isClassDay(d) && d >= getSchedule().termStarts; i++) d = addDays(d, dir);
    setPicked(d);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Classes"
        subtitle="Each class's Meet link. Students see Join 10 minutes before it starts, and joining marks them present."
      />

      <div className="mb-6 inline-flex rounded-full border border-border bg-surface p-1">
        {(["day", "week"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${view === v ? "bg-brand text-on-brand" : "text-ink-2 hover:text-ink"}`}
          >
            {v === "day" ? "Day by day" : "Weekly timetable"}
          </button>
        ))}
      </div>

      {view === "week" ? (
        <TimetableEditor onSaved={() => setRev((n) => n + 1)} />
      ) : (
      <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous class day">
          <Icon.ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="text-base font-semibold text-ink">
            {new Date(`${date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          {date !== today ? (
            <button type="button" onClick={() => setPicked(today)} className="text-xs font-semibold text-brand hover:underline">
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

      {ready === false && (
        <Card className="mb-6 p-5 text-sm text-ink-2">
          Classes switch on after your developer applies the database update (hand-off, section 1). Until then links can&apos;t be saved.
        </Card>
      )}

      {!slots.length && (
        <Card className="p-6 text-center text-sm text-ink-2">
          {date < getSchedule().termStarts
            ? `Classes start on ${new Date(`${getSchedule().termStarts}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.`
            : db.classes.length
              ? "No classes on this day."
              : "Add the levels and subjects first (Cohorts)."}
        </Card>
      )}

      <div className="space-y-6">
        {levels.map((level) => {
          const block = slots.filter((s) => s.level === level);
          // After the block ends: everyone in this level who joined none of its
          // classes and has no mark yet. One tap marks them absent.
          const levelStudents = [...new Set(block.flatMap((s) => enrolled.get(slotKey(s)) ?? []))];
          const joinedLevel = new Set(joins.filter((j) => j.classId === block[0].classId).map((j) => j.studentId));
          const noShows =
            nowMs >= block[block.length - 1].endMs && joinedLevel.size > 0
              ? levelStudents.filter(
                  (st) =>
                    !joinedLevel.has(st.id) &&
                    !db.attendanceDays.some((a) => a.studentId === st.id && a.date === date),
                )
              : [];
          return (
            <Card key={level} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-3">Level</p>
                  <h2 className="text-lg font-bold text-ink">
                    {LEVEL_LABEL[level]}{" "}
                    <span className="text-sm font-medium text-ink-3">
                      {timeLabel(block[0].start)} to {timeLabel(block[block.length - 1].end)} PM
                    </span>
                  </h2>
                </div>
                <OneLinkForAll disabled={ready === false} onSave={(v) => store(block, "meetUrl", v)} />
              </div>
              <ul className="divide-y divide-border">
                {block.map((s) => {
                  const link = linkFor(s);
                  const who = enrolled.get(slotKey(s)) ?? [];
                  const joined = new Set(joins.filter((j) => slotKey(j) === slotKey(s)).map((j) => j.studentId));
                  const missing = who.filter((w) => !joined.has(w.id));
                  const phase = nowMs < s.startMs ? "later" : nowMs < s.endMs ? "live" : "done";
                  if (s.cancelled)
                    return (
                      <li key={slotKey(s)} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 opacity-70">
                        <p className="font-semibold text-ink-3 line-through">
                          {s.subject} <span className="text-sm font-normal">{timeLabel(s.start)} to {timeLabel(s.end)}</span>
                        </p>
                        <span className="flex items-center gap-2">
                          <Badge tone="warning">Cancelled</Badge>
                          <button type="button" className="h-9 px-2 text-xs font-semibold text-brand hover:underline" onClick={() => void changeDay(s.level, s.subject, null, "Class is back on.")}>
                            Restore
                          </button>
                        </span>
                      </li>
                    );
                  return (
                    <li key={slotKey(s)} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink">
                          {s.subject}{" "}
                          <span className="text-sm font-normal text-ink-3">
                            {timeLabel(s.start)} to {timeLabel(s.end)}
                          </span>
                        </p>
                        <div className="flex items-center gap-2">
                          {s.changed && <Badge tone="info">Changed for this day</Badge>}
                          {phase === "later" && (
                            <DayActions
                              slot={s}
                              onCancel={() => void changeDay(s.level, s.subject, { cancelled: true }, `${s.subject} cancelled for this day. Students won't see it.`)}
                              onMove={(start, end) => void changeDay(s.level, s.subject, { start, end }, `${s.subject} moved to ${timeLabel(start)} for this day.`)}
                            />
                          )}
                          {date === today && phase === "live" && <Badge tone="brand">Live now</Badge>}
                          {who.length > 0 && (date < today || (date === today && phase !== "later")) && (
                            <Badge tone={missing.length ? "neutral" : "success"}>
                              {joined.size} of {who.length} joined
                            </Badge>
                          )}
                        </div>
                      </div>
                      <LinkField
                        key={`m-${slotKey(s)}-${link?.meetUrl ?? ""}`}
                        label="Meet link"
                        placeholder="Paste the Meet link"
                        initial={link?.meetUrl ?? ""}
                        disabled={ready === false}
                        onSave={(v) => store([s], "meetUrl", v)}
                      />
                      {(phase === "done" || date < today) && (
                        <LinkField
                          key={`r-${slotKey(s)}-${link?.recordingUrl ?? ""}`}
                          label="Recording"
                          placeholder="Paste the recording link (Drive)"
                          initial={link?.recordingUrl ?? ""}
                          disabled={ready === false}
                          onSave={(v) => store([s], "recordingUrl", v)}
                        />
                      )}
                      {phase !== "later" && missing.length > 0 && joined.size > 0 && (
                        <p className="text-xs text-ink-3">
                          Not joined: {missing.map((m) => displayName(m.username)).join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {noShows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-5 py-3">
                  <p className="text-sm text-ink-2">
                    {noShows.length === 1 ? "1 student" : `${noShows.length} students`} didn&apos;t join any class today.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      for (const st of noShows) portal.setAttendance(st.id, block[0].classId, date, "absent");
                      toast(`Marked ${noShows.length} absent. Change any in Attendance.`, "success");
                    }}
                  >
                    Mark them absent
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {(date >= today || picked === null) && <ExtraClass date={date} onAdd={(level, subject, start, end) => void changeDay(level, subject, { extra: true, start, end }, `Extra ${subject} class added.`)} />}
      </>
      )}

      {/* Setup sits quietly under the classes: the day's classes come first. */}
      <GoogleConnect onSynced={() => void reload()} />
    </div>
  );
}

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
  const commit = async (v: string) => {
    if (v.trim() === saved.trim()) return;
    if (await onSave(v)) setSaved(v);
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
          setValue(v);
          void commit(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && void commit(value)}
        onBlur={() => void commit(value)}
        className={cn(
          "h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60",
        )}
      />
      {saved && (
        <a
          href={saved}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          aria-label={`Open ${label.toLowerCase()}`}
        >
          <Icon.ChevronRight className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

/** One Meet link for the whole level block (saves pasting three times). */
function OneLinkForAll({ disabled, onSave }: { disabled?: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open)
    return (
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        One link for all three
      </Button>
    );
  return (
    <form
      className="flex w-full items-center gap-2 sm:w-auto"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave(value)) {
          setOpen(false);
          setValue("");
        }
      }}
    >
      <input
        autoFocus
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste the Meet link"
        className="h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 sm:w-64"
      />
      <Button size="sm" type="submit" disabled={!value.trim()}>
        Save
      </Button>
    </form>
  );
}

/** "Cancel this day" / "Change time" for one class on one date. */
function DayActions({ slot, onCancel, onMove }: { slot: DaySlot; onCancel: () => void; onMove: (start: string, end: string) => void }) {
  const [moving, setMoving] = useState(false);
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  const small = "h-9 rounded-full px-3 text-xs font-semibold transition-colors";
  if (moving)
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink" aria-label="New start" />
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink" aria-label="New end" />
        <button type="button" disabled={!(start < end)} className={`${small} bg-brand text-on-brand disabled:opacity-50`} onClick={() => { onMove(start, end); setMoving(false); }}>
          Save
        </button>
        <button type="button" className={`${small} text-ink-3 hover:text-ink`} onClick={() => setMoving(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <span className="flex items-center">
      <button type="button" className={`${small} text-ink-3 hover:bg-surface-2 hover:text-ink`} onClick={() => setMoving(true)}>
        Change time
      </button>
      <button type="button" className={`${small} text-ink-3 hover:bg-surface-2 hover:text-error`} onClick={onCancel}>
        Cancel class
      </button>
    </span>
  );
}

/** One-off class on this date (a make-up or revision class). */
function ExtraClass({ date, onAdd }: { date: string; onAdd: (level: LevelKey, subject: SubjectKey, start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<LevelKey>("A2");
  const [subject, setSubject] = useState<SubjectKey>("Economics");
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("16:40");
  const f = "h-10 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink";
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
        <Icon.Plus className="h-4 w-4" /> Add an extra class on this day
      </button>
    );
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-2 p-4">
      <span className="w-full text-sm font-semibold text-ink">
        Extra class on {new Date(`${date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
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
      <input type="time" className={f} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Starts" />
      <input type="time" className={f} value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Ends" />
      <Button size="sm" disabled={!(start < end)} onClick={() => { onAdd(level, subject, start, end); setOpen(false); }}>
        Add
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </Card>
  );
}
