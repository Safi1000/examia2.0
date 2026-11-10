"use client";

import { useMemo, useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { addDays, pkDate } from "@/lib/timetable";
import { useActivity } from "@/lib/activity-admin";
import {
  AREA_LABEL,
  TRACKING_SINCE,
  activeDays,
  areasBetween,
  daySecs,
  fmtAgo,
  fmtTime,
  lastSeen,
  secsBetween,
  type Area,
  type DayActivity,
  type NoteActivity,
} from "@/lib/activity";
import { Card, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";

const dayLabel = (d: string, withDay = true) =>
  new Date(`${d}T12:00:00+05:00`).toLocaleDateString("en-GB", {
    ...(withDay ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    timeZone: "Asia/Karachi",
  });

function daysFrom(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Minutes per day as thin gold bars. Tap or hover a bar to read it. */
export function DailyBars({ days, from, to, compact = false }: { days: Record<string, DayActivity>; from: string; to: string; compact?: boolean }) {
  const list = useMemo(() => daysFrom(from, to), [from, to]);
  const vals = list.map((d) => daySecs(days[d]));
  const max = Math.max(60 * 30, ...vals);
  const [sel, setSel] = useState<number | null>(null);

  if (compact) {
    return (
      <div className="flex h-6 items-end gap-px" aria-hidden>
        {vals.map((v, i) => (
          <span
            key={list[i]}
            className={cn("flex-1 rounded-t-[2px]", v >= 60 ? "bg-brand" : "bg-surface-2")}
            style={{ height: v >= 60 ? `${Math.max(14, (v / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
    );
  }

  const total = vals.reduce((a, v) => a + v, 0);
  const on = vals.filter((v) => v >= 60).length;
  // Days before tracking began cannot count against anyone: "3 of 30" when there were only 5 to be had.
  const counted = list.filter((d) => d >= TRACKING_SINCE).length;
  return (
    <div>
      <p className="mb-3 h-5 text-sm text-ink-2 tabular-nums" aria-live="polite">
        {sel !== null ? (
          <>
            <span className="font-semibold text-ink">{dayLabel(list[sel])}</span> · {fmtTime(vals[sel])}
          </>
        ) : (
          <>
            {on ? `Active on ${on} of ${counted} ${counted === 1 ? "day" : "days"}` : "No activity yet"}
            {on ? ` · about ${fmtTime(total / on)} a day when active` : ""}
          </>
        )}
      </p>
      <div className="flex h-28 items-end gap-[2px]" onPointerLeave={() => setSel(null)}>
        {vals.map((v, i) => (
          <button
            key={list[i]}
            type="button"
            onPointerEnter={() => setSel(i)}
            onFocus={() => setSel(i)}
            onClick={() => setSel(i)}
            aria-label={`${dayLabel(list[i])}: ${fmtTime(v)}`}
            className="group flex h-full flex-1 items-end outline-none"
          >
            <span
              className={cn(
                "block w-full rounded-t-[4px] transition-opacity",
                v >= 60 ? "bg-brand" : "bg-surface-2",
                sel !== null && sel !== i && "opacity-40",
                "group-focus-visible:ring-2 group-focus-visible:ring-brand group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface",
              )}
              style={{ height: v >= 60 ? `${Math.max(4, (v / max) * 100)}%` : "2px" }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-3">
        <span>{dayLabel(list[0], false)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** Where the time went, biggest first, as labelled bars. */
export function AreaBars({ areas }: { areas: Partial<Record<Area, number>> }) {
  const rows = (Object.entries(areas) as Array<[Area, number]>).filter(([, v]) => v >= 60).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <p className="text-sm text-ink-3">Nothing yet.</p>;
  const max = rows[0][1];
  return (
    <ul className="space-y-2.5">
      {rows.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,9rem)_1fr_auto]">
          <span className="truncate text-ink-2">{AREA_LABEL[k]}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.max(3, (v / max) * 100)}%` }} />
          </span>
          <span className="whitespace-nowrap text-right font-semibold text-ink tabular-nums">{fmtTime(v)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Notes read, most recent first: how much of each and how long. */
export function NotesRead({ notes, limit = 50 }: { notes: Record<string, NoteActivity>; limit?: number }) {
  const db = useDatabase();
  const titles = useMemo(() => new Map(db.notes.map((n) => [n.id, n.title])), [db.notes]);
  const rows = Object.entries(notes)
    .filter(([, n]) => n.s >= 30)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit);
  if (!rows.length) return <p className="text-sm text-ink-3">No notes read yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map(([id, n]) => {
        // A note swapped for a shorter file can leave old page numbers behind.
        const seen = n.t ? n.p.filter((p) => p <= n.t).length : n.p.length;
        const pct = n.t ? Math.min(100, Math.round((seen / n.t) * 100)) : 0;
        return (
          <li key={id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-ink">{titles.get(id) ?? "A note you've since removed"}</p>
              <span className="shrink-0 text-xs tabular-nums text-ink-3">{dayLabel(pkDate(n.at))}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.max(2, pct)}%` }} />
              </span>
              <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                {n.t ? `${seen} of ${n.t} pages` : `${seen} ${seen === 1 ? "page" : "pages"}`} · {fmtTime(n.s)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums tracking-[-0.02em] text-ink">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink-3">{note}</p>}
    </Card>
  );
}

/** On a student's profile: their last 30 days in the portal. */
export function StudentActivitySection({ studentId }: { studentId: string }) {
  const db = useDatabase();
  const nowMs = useNow();
  const today = pkDate(nowMs);
  const from = addDays(today, -29);
  const { data, error, reload } = useActivity(from, db, studentId);
  const a = data?.[studentId];
  // Out of the days there were to be active on: from the first tracked day if that is later.
  const start = from < TRACKING_SINCE ? TRACKING_SINCE : from;
  const span = Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 864e5) + 1);

  return (
    <section id="activity" className="mt-8 scroll-mt-20">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Activity</h2>
        <span className="text-xs text-ink-3">Only you see this</span>
      </div>
      {error ? (
        <Card className="p-5 text-sm text-ink-2">
          Activity didn&apos;t load.{" "}
          <button type="button" onClick={reload} className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-2 hover:underline">
            Try again
          </button>
        </Card>
      ) : !data ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-ink-3">
          <Spinner size={18} /> Loading activity…
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Last 7 days" value={fmtTime(a ? secsBetween(a.days, addDays(today, -6), today) : 0)} />
            <Tile label="Last 30 days" value={fmtTime(a ? secsBetween(a.days, from, today) : 0)} />
            <Tile label="Days active" value={`${a ? activeDays(a.days, start, today) : 0} of ${span}`} />
            <Tile label="Last seen" value={fmtAgo(lastSeen(a), nowMs)} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-1 text-sm font-semibold text-ink">Each day</h3>
              <DailyBars days={a?.days ?? {}} from={from} to={today} />
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Where the time goes</h3>
              <AreaBars areas={a ? areasBetween(a.days, from, today) : {}} />
            </Card>
          </div>
          <Card className="mt-3 p-5">
            <h3 className="mb-3 text-sm font-semibold text-ink">Notes read</h3>
            <NotesRead notes={a?.notes ?? {}} />
          </Card>
          {from < TRACKING_SINCE && (
            <p className="mt-2 text-xs text-ink-3">Counted from {dayLabel(TRACKING_SINCE, false)} {TRACKING_SINCE.slice(0, 4)}, when tracking began. Only active time counts: an open but idle screen doesn&apos;t.</p>
          )}
        </>
      )}
    </section>
  );
}
