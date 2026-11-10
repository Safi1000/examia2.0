"use client";

import { useEffect, useState } from "react";
import { Button, Card, Icon } from "@/components/ui";
import { useToast } from "@/components/toast";
import { saveWeekly } from "@/components/ScheduleGate";
import { useSchedule, useScheduleLoaded } from "@/lib/classes";
import { DEFAULT_SCHEDULE, LEVEL_LABEL, isTime, span, timeLabel, type LevelKey, type Schedule, type SubjectKey, type WeekSlot } from "@/lib/timetable";
import { cn } from "@/lib/cn";

const LEVELS: LevelKey[] = ["A2", "O", "AS"];
const SUBJECTS: SubjectKey[] = ["Economics", "Business", "Accounting"];
const DAYS = [
  { d: 1, label: "Mon" },
  { d: 2, label: "Tue" },
  { d: 3, label: "Wed" },
  { d: 4, label: "Thu" },
  { d: 5, label: "Fri" },
  { d: 6, label: "Sat" },
  { d: 0, label: "Sun" },
];

const field =
  "h-10 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-md:h-11 max-md:text-base";

const LEAVE = "You have timetable changes that aren't saved. Leave them?";

/** Classes of different levels at the same time on a shared day (Hamza can't teach both). */
function clashes(x: Pick<Schedule, "days" | "slots">): Map<string, string> {
  const out = new Map<string, string>();
  const daysOf = (s: WeekSlot) => s.days ?? x.days;
  for (const [i, a] of x.slots.entries())
    for (const b of x.slots.slice(i + 1)) {
      if (a.level === b.level || !isTime(a.start) || !isTime(a.end) || !isTime(b.start) || !isTime(b.end)) continue;
      if (!daysOf(a).some((d) => daysOf(b).includes(d)) || !(a.start < b.end && b.start < a.end)) continue;
      const one = (s: WeekSlot) => `${LEVEL_LABEL[s.level]} ${s.subject} (${span(s.start, s.end)})`;
      out.set([`${a.level}|${a.subject}|${a.start}|${a.end}`, `${b.level}|${b.subject}|${b.start}|${b.end}`].sort().join("~"), `${one(a)} and ${one(b)}`);
    }
  return out;
}

/**
 * The weekly timetable: class days, term start, and each level's classes
 * (subject and times). Changes apply from the next page load for students;
 * one-off changes for a single date live on the day view instead.
 */
export function TimetableEditor({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { toast } = useToast();
  const saved = useSchedule();
  const loaded = useScheduleLoaded();
  const [draft, setDraft] = useState<Schedule>(() => structuredClone(saved));
  const [busy, setBusy] = useState(false);
  // Rows sit in time order, but not while a time is being typed: a row that
  // jumped mid-edit took the cursor (or the tablet's time picker) with it.
  const [frozen, setFrozen] = useState<number[] | null>(null);
  const inTime = draft.slots.map((_, i) => i).sort((a, b) => draft.slots[a].start.localeCompare(draft.slots[b].start) || a - b);
  const order = frozen && frozen.length === draft.slots.length ? frozen : inTime;
  const weekly = (x: Schedule) => JSON.stringify([x.termStarts, x.days, x.slots]);
  const dirty = weekly(draft) !== weekly(saved);
  // The saved timetable arrived (or changed elsewhere) while nothing was edited here: show it.
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    if (!dirty) {
      setDraft(structuredClone(saved));
      setFrozen(null);
    }
  }
  // Unsaved edits: the page asks before switching away, and so does the browser
  // (closing or reloading) and the console's own menu (a link to another page).
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const leave = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || a.pathname === window.location.pathname) return;
      if (window.confirm(LEAVE)) return;
      // Caught before the link's own handler, so the page stays put.
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty, onDirtyChange]);

  const setSlot = (i: number, patch: Partial<WeekSlot>) =>
    setDraft((d) => ({ ...d, slots: d.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addSlot = (level: LevelKey) => {
    setFrozen(null);
    setDraft((d) => {
      const last = d.slots.filter((s) => s.level === level && isTime(s.end)).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
      const start = last?.end ?? "15:30";
      const [h, m] = start.split(":").map(Number);
      const endMin = Math.min(23 * 60 + 59, h * 60 + m + 40);
      const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      // The first subject this level doesn't have yet, so a new row isn't a quiet duplicate.
      const used = new Set(d.slots.filter((s) => s.level === level).map((s) => s.subject));
      const subject = SUBJECTS.find((x) => !used.has(x)) ?? "Economics";
      return { ...d, slots: [...d.slots, { level, subject, start, end }] };
    });
  };

  async function save() {
    // A cleared time box is "": the server would drop that class without a word.
    const blank = draft.slots.find((s) => !isTime(s.start) || !isTime(s.end));
    if (blank) return toast(`${LEVEL_LABEL[blank.level]} ${blank.subject}: fill in both the start and the end time.`, "error");
    const bad = draft.slots.find((s) => !(s.start < s.end));
    if (bad) return toast(`${LEVEL_LABEL[bad.level]} ${bad.subject}: the end time must be after the start.`, "error");
    if (!draft.days.length) return toast("Pick at least one class day.", "error");
    // Same level on the same day: one class per subject (each has its own Meet
    // link and register), and no two classes at the same time.
    const daysOf = (x: WeekSlot) => x.days ?? draft.days;
    for (const [i, a] of draft.slots.entries()) {
      for (const b of draft.slots.slice(i + 1)) {
        if (a.level !== b.level || !daysOf(a).some((d) => daysOf(b).includes(d))) continue;
        if (a.subject === b.subject)
          return toast(`${LEVEL_LABEL[a.level]} has ${a.subject} twice on the same day. Change one subject or remove it.`, "error");
        if (a.start < b.end && b.start < a.end)
          return toast(`${LEVEL_LABEL[a.level]}: ${a.subject} and ${b.subject} overlap (${timeLabel(a.start)} and ${timeLabel(b.start)}).`, "error");
      }
    }
    // Two levels at once is allowed (a joint class), but never by accident. Asked once, when it's new.
    const before = clashes(saved);
    const fresh = [...clashes(draft)].filter(([k]) => !before.has(k)).map(([, v]) => v);
    if (fresh.length && !window.confirm(`${fresh[0]} are at the same time${fresh.length > 1 ? `, and ${fresh.length - 1} more like it` : ""}. Save anyway?`)) return;
    setBusy(true);
    try {
      setDraft(structuredClone(await saveWeekly(draft)));
      setFrozen(null);
      toast("Timetable saved. Students see it next time they open the portal.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-5"
      onFocus={(e) => {
        if (!frozen && e.target instanceof HTMLInputElement && e.target.type === "time") setFrozen(inTime);
      }}
      onBlur={(e) => {
        if (frozen && !e.currentTarget.contains(e.relatedTarget)) setFrozen(null);
      }}
    >
      {!loaded && (
        <p role="status" className="text-sm text-ink-3">
          Loading your saved timetable. You can save changes once it is here.
        </p>
      )}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-ink">Classes start on</span>
            <input type="date" className={field} value={draft.termStarts} onChange={(e) => e.target.value && setDraft({ ...draft, termStarts: e.target.value })} />
          </label>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink">Class days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(({ d, label }) => {
                const on = draft.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort() })}
                    className={cn(
                      "h-10 min-w-12 rounded-full border px-3 text-sm font-semibold transition-colors pointer-coarse:h-11",
                      on ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-2 hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </Card>

      {LEVELS.map((level) => {
        const rows = order.map((i) => ({ s: draft.slots[i], i })).filter(({ s }) => s.level === level);
        return (
          <Card key={level} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{LEVEL_LABEL[level]}</h3>
              <Button size="sm" variant="ghost" onClick={() => addSlot(level)}>
                <Icon.Plus className="h-4 w-4" /> Add class
              </Button>
            </div>
            {rows.length === 0 && <p className="px-5 py-4 text-sm text-ink-3">No classes for this level.</p>}
            <ul className="divide-y divide-border">
              {rows.map(({ s, i }) => (
                <li key={i} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  {/* Phones: subject and bin on one line, the two times on the next. */}
                  <select className={cn(field, "min-w-32 max-sm:min-w-0 max-sm:flex-1 max-sm:basis-[calc(100%-3.25rem)]")} value={s.subject} onChange={(e) => setSlot(i, { subject: e.target.value as SubjectKey })} aria-label="Subject">
                    {SUBJECTS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <input type="time" className={cn(field, "max-sm:order-1 max-sm:min-w-0 max-sm:flex-1")} value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label={`${s.subject} starts`} aria-invalid={!isTime(s.start)} />
                  <span className="text-sm text-ink-3 max-sm:order-1">to</span>
                  <input type="time" className={cn(field, "max-sm:order-1 max-sm:min-w-0 max-sm:flex-1")} value={s.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label={`${s.subject} ends`} aria-invalid={!isTime(s.end) || !(s.start < s.end)} />
                  <button
                    type="button"
                    onClick={() => {
                      setFrozen(null);
                      setDraft({ ...draft, slots: draft.slots.filter((_, j) => j !== i) });
                    }}
                    className="ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-error pointer-coarse:h-11 pointer-coarse:w-11"
                    aria-label={`Remove ${LEVEL_LABEL[level]} ${s.subject}${isTime(s.start) ? ` ${timeLabel(s.start)}` : ""}`}
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      {/* Phones: sits above the bottom bar (it used to hide behind it), squared off when it wraps. */}
      <div className="sticky bottom-4 z-10 ml-auto flex w-fit flex-wrap items-center justify-end gap-2 rounded-full border border-border bg-paper/90 p-1.5 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl max-md:bottom-[calc(5.75rem+env(safe-area-inset-bottom))] max-sm:rounded-[22px]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFrozen(null);
            setDraft({ ...structuredClone(DEFAULT_SCHEDULE), exceptions: draft.exceptions });
          }}
        >
          Back to the original timetable
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty || busy}
          onClick={() => {
            setFrozen(null);
            setDraft(structuredClone(saved));
          }}
        >
          Undo changes
        </Button>
        {/* Never save before the real timetable has loaded (that would overwrite it with the default). */}
        <Button size="sm" loading={busy} disabled={!dirty || !loaded} onClick={() => void save()}>
          Save timetable
        </Button>
      </div>
    </div>
  );
}
