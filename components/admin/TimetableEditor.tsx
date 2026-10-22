"use client";

import { useState } from "react";
import { Button, Card, Icon } from "@/components/ui";
import { useToast } from "@/components/toast";
import { storeSchedule } from "@/components/ScheduleGate";
import { DEFAULT_SCHEDULE, LEVEL_LABEL, getSchedule, timeLabel, type LevelKey, type Schedule, type SubjectKey, type WeekSlot } from "@/lib/timetable";
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
  "h-10 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * The weekly timetable: class days, term start, and each level's classes
 * (subject and times). Changes apply from the next page load for students;
 * one-off changes for a single date live on the day view instead.
 */
export function TimetableEditor({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Schedule>(() => structuredClone(getSchedule()));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(getSchedule());

  const setSlot = (i: number, patch: Partial<WeekSlot>) =>
    setDraft((d) => ({ ...d, slots: d.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addSlot = (level: LevelKey) =>
    setDraft((d) => {
      const last = d.slots.filter((s) => s.level === level).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
      const start = last?.end ?? "15:30";
      const [h, m] = start.split(":").map(Number);
      const endMin = Math.min(23 * 60 + 59, h * 60 + m + 40);
      const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      return { ...d, slots: [...d.slots, { level, subject: "Economics", start, end }] };
    });

  async function save() {
    const bad = draft.slots.find((s) => !(s.start < s.end));
    if (bad) return toast(`${LEVEL_LABEL[bad.level]} ${bad.subject}: the end time must be after the start.`, "error");
    if (!draft.days.length) return toast("Pick at least one class day.", "error");
    setBusy(true);
    try {
      setDraft(structuredClone(await storeSchedule(draft)));
      toast("Timetable saved. Students see it next time they open the portal.", "success");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
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
                      "h-10 min-w-12 rounded-full border px-3 text-sm font-semibold transition-colors",
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
        const rows = draft.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.level === level).sort((a, b) => a.s.start.localeCompare(b.s.start));
        return (
          <Card key={level} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="font-bold text-ink">{LEVEL_LABEL[level]}</h3>
              <Button size="sm" variant="ghost" onClick={() => addSlot(level)}>
                <Icon.Plus className="h-4 w-4" /> Add class
              </Button>
            </div>
            {rows.length === 0 && <p className="px-5 py-4 text-sm text-ink-3">No classes for this level.</p>}
            <ul className="divide-y divide-border">
              {rows.map(({ s, i }) => (
                <li key={i} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <select className={cn(field, "min-w-32")} value={s.subject} onChange={(e) => setSlot(i, { subject: e.target.value as SubjectKey })} aria-label="Subject">
                    {SUBJECTS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <input type="time" className={field} value={s.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label="Starts" />
                  <span className="text-sm text-ink-3">to</span>
                  <input type="time" className={field} value={s.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label="Ends" />
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, slots: draft.slots.filter((_, j) => j !== i) })}
                    className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-error"
                    aria-label={`Remove ${s.subject} ${timeLabel(s.start)}`}
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      <div className="sticky bottom-4 z-10 ml-auto flex w-fit flex-wrap items-center justify-end gap-2 rounded-full border border-border bg-paper/90 p-1.5 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <Button variant="ghost" size="sm" onClick={() => setDraft({ ...structuredClone(DEFAULT_SCHEDULE), exceptions: draft.exceptions })}>
          Back to the original timetable
        </Button>
        <Button variant="secondary" size="sm" disabled={!dirty || busy} onClick={() => setDraft(structuredClone(getSchedule()))}>
          Undo changes
        </Button>
        <Button size="sm" loading={busy} disabled={!dirty} onClick={() => void save()}>
          Save timetable
        </Button>
      </div>
    </div>
  );
}
