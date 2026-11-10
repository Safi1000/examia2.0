"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { archivedCohortIds, cohortById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { useNow } from "@/hooks/useNow";
import { addDays, pkDate } from "@/lib/timetable";
import { useActivity } from "@/lib/activity-admin";
import { TRACKING_SINCE, activeDays, areasBetween, daysAgo, fmtAgo, fmtTime, lastSeen, secsBetween, type Area } from "@/lib/activity";
import { AreaBars, DailyBars, Tile } from "@/components/admin/ActivityParts";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CohortDot, EmptyState, Icon, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";

type Sort = "most" | "least" | "recent" | "name";
const SORTS: Array<[Sort, string]> = [
  ["most", "Most time"],
  ["least", "Least time"],
  ["recent", "Last seen"],
  ["name", "Name"],
];

/**
 * For Hamza only: how much each student actually uses the portal, where the
 * time goes, which notes get read, and who has gone quiet.
 */
export default function ActivityPage() {
  const db = useDatabase();
  const nowMs = useNow();
  const { cohortId } = useAdminFilter();
  const [range, setRange] = useState<7 | 30>(7);
  const [sort, setSort] = useState<Sort>("most");
  const [query, setQuery] = useState("");

  const today = pkDate(nowMs);
  // One fetch covers both ranges; the 7-day view reads the end of it.
  const from30 = addDays(today, -29);
  const from = range === 7 ? addDays(today, -6) : from30;
  const { data, error, reload } = useActivity(from30, db);

  const students = useMemo(() => {
    const off = archivedCohortIds(db);
    return db.students.filter((s) => !off.has(s.cohortId) && (cohortId === null || s.cohortId === cohortId));
  }, [db, cohortId]);

  const rows = useMemo(() => {
    if (!data) return [];
    return students.map((s) => {
      const a = data[s.id];
      const days = a?.days ?? {};
      const notes = Object.values(a?.notes ?? {}).filter((n) => n.s >= 30 && n.at >= Date.parse(`${from}T00:00:00+05:00`)).length;
      return { s, a, secs: secsBetween(days, from, today), on: activeDays(days, from, today), notes, seen: lastSeen(a) };
    });
  }, [data, students, from, today]);

  const totals = useMemo(() => {
    const areas: Partial<Record<Area, number>> = {};
    const readers = new Map<string, Set<string>>();
    let secs = 0;
    for (const r of rows) {
      secs += r.secs;
      if (r.a) {
        for (const [k, v] of Object.entries(areasBetween(r.a.days, from, today))) areas[k as Area] = (areas[k as Area] ?? 0) + (v ?? 0);
        for (const [id, n] of Object.entries(r.a.notes)) {
          if (n.s < 30 || n.at < Date.parse(`${from}T00:00:00+05:00`)) continue;
          readers.set(id, (readers.get(id) ?? new Set()).add(r.s.id));
        }
      }
    }
    const active = rows.filter((r) => r.secs >= 60).length;
    const titles = new Map(db.notes.map((n) => [n.id, n.title]));
    const topNotes = [...readers.entries()]
      .map(([id, set]) => ({ id, title: titles.get(id), readers: set.size }))
      .filter((n) => n.title)
      .sort((a, b) => b.readers - a.readers)
      .slice(0, 6);
    return { secs, active, areas, topNotes, notesOpened: readers.size };
  }, [rows, from, today, db.notes]);

  const quiet = rows.filter((r) => daysAgo(r.seen, nowMs) >= 7).sort((a, b) => (a.seen ?? 0) - (b.seen ?? 0));

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => !q || r.s.username.toLowerCase().includes(q) || displayName(r.s.username).toLowerCase().includes(q));
    const by: Record<Sort, (a: (typeof out)[number], b: (typeof out)[number]) => number> = {
      most: (a, b) => b.secs - a.secs,
      least: (a, b) => a.secs - b.secs || (a.seen ?? 0) - (b.seen ?? 0),
      recent: (a, b) => (b.seen ?? 0) - (a.seen ?? 0),
      name: (a, b) => displayName(a.s.username).localeCompare(displayName(b.s.username)),
    };
    return out.sort(by[sort]);
  }, [rows, query, sort]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader title="Activity" subtitle="How your students use the portal, so you know who to help. Only you see this." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Period" className="inline-flex rounded-full border border-border p-1">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn("h-9 rounded-full px-4 text-sm font-semibold", range === r ? "bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-ink-3 hover:text-ink")}
            >
              Last {r} days
            </button>
          ))}
        </div>
        {from < TRACKING_SINCE && <span className="text-xs text-ink-3">Counted from 7 Nov 2026, when tracking began</span>}
      </div>

      {error ? (
        <Card className="p-6 text-sm text-ink-2">
          Activity didn&apos;t load.{" "}
          <button type="button" onClick={reload} className="font-semibold text-brand underline-offset-2 hover:underline">
            Try again
          </button>
        </Card>
      ) : !data ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-ink-3">
          <Spinner size={18} /> Loading activity…
        </Card>
      ) : students.length === 0 ? (
        <EmptyState icon={<Icon.Users />} title="No students here" message="Add students in Roster, or pick another cohort." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Active students" value={`${totals.active} of ${rows.length}`} note="A minute or more" />
            <Tile label="Study time, all students" value={fmtTime(totals.secs)} />
            <Tile label="Average per active student" value={fmtTime(totals.active ? totals.secs / totals.active : 0)} />
            <Tile label="Notes opened" value={String(totals.notesOpened)} note="Different notes read" />
          </div>

          {quiet.length > 0 && (
            <Card className="mt-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-ink">Gone quiet</h2>
                <span className="text-xs text-ink-3">Not in the portal for a week or more</span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {quiet.slice(0, 30).map(({ s, seen }) => (
                  <li key={s.id}>
                    <Link
                      href={`/admin/roster/${s.id}#activity`}
                      className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-sm text-ink hover:border-border-strong"
                    >
                      {displayName(s.username)}
                      <span className="text-xs text-ink-3">{seen ? fmtAgo(seen, nowMs) : "never signed in"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {quiet.length > 30 && <p className="mt-2 text-xs text-ink-3">And {quiet.length - 30} more.</p>}
            </Card>
          )}

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card className="min-w-0 p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink">Where the time goes</h2>
              <AreaBars areas={totals.areas} />
            </Card>
            <Card className="min-w-0 p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink">Most-read notes</h2>
              {totals.topNotes.length ? (
                <ol className="space-y-2.5">
                  {totals.topNotes.map((n) => (
                    <li key={n.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-ink-2">{n.title}</span>
                      <span className="shrink-0 whitespace-nowrap font-semibold text-ink tabular-nums">
                        {n.readers} {n.readers === 1 ? "student" : "students"}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-3">No notes read in this period yet.</p>
              )}
            </Card>
          </div>

          <div className="mb-3 mt-8 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-base font-semibold text-ink">Students</h2>
            <label className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
              <Icon.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a student"
                aria-label="Find a student"
                className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-3">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-10 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
              >
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">No student matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <Card className="divide-y divide-border overflow-hidden p-0">
              {list.map(({ s, a, secs, on, notes, seen }) => {
                const cohort = cohortById(db, s.cohortId);
                return (
                  <Link
                    key={s.id}
                    href={`/admin/roster/${s.id}#activity`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {cohort ? <CohortDot color={cohort.color} /> : <span className="w-2.5 shrink-0" aria-hidden />}
                        <span className="truncate font-semibold text-ink">{displayName(s.username)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">
                        Seen {fmtAgo(seen, nowMs).toLowerCase()}
                        {notes ? ` · ${notes} ${notes === 1 ? "note" : "notes"}` : ""}
                        {` · ${on} ${on === 1 ? "day" : "days"} active`}
                      </span>
                    </span>
                    <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                      <DailyBars days={a?.days ?? {}} from={from} to={today} compact />
                    </span>
                    <span className="col-start-2 row-start-1 whitespace-nowrap text-right font-semibold text-ink tabular-nums sm:col-start-auto sm:row-start-auto">
                      {fmtTime(secs)}
                    </span>
                  </Link>
                );
              })}
            </Card>
          )}
          <p className="mt-3 text-xs text-ink-3">Only active time counts: the portal open and in front, and the student reading, tapping or typing.</p>
        </>
      )}
    </div>
  );
}
