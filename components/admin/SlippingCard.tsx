"use client";

import Link from "next/link";
import type { Database } from "@/lib/data/seed";
import type { Profile } from "@/lib/profile";
import { archivedCohortIds } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { addDays, pkDate } from "@/lib/timetable";
import { Card } from "@/components/ui";

/**
 * For Hamza only: students with no Groundwork study in the last 5 days, so a
 * quick nudge can come before the habit is gone. Students never see this.
 */
export function SlippingCard({ db, profiles, nowMs, cohortId }: { db: Database; profiles: Record<string, Profile>; nowMs: number; cohortId: string | null }) {
  const today = pkDate(nowMs);
  const off = archivedCohortIds(db);
  const lastStudy = (p?: Profile) => Object.entries(p?.focus?.days ?? {}).filter(([, m]) => m > 0).map(([d]) => d).sort().pop() ?? null;
  const cutoff = addDays(today, -5);
  const list = db.students
    .filter((s) => !off.has(s.cohortId) && (cohortId === null || s.cohortId === cohortId))
    .map((s) => ({ s, last: lastStudy(profiles[s.id]) }))
    .filter((x) => !x.last || x.last < cutoff)
    .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));
  if (!list.length) return null;
  const ago = (d: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5);
  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-ink">Slipping in Groundwork</h2>
        <span className="text-xs text-ink-3">No study in 5 days or more · only you see this</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.slice(0, 24).map(({ s, last }) => (
          <li key={s.id}>
            <Link href={`/admin/roster/${s.id}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-border-strong">
              {displayName(s.username)}
              <span className="text-xs text-ink-3">{last ? `${ago(last)} days` : "never"}</span>
            </Link>
          </li>
        ))}
      </ul>
      {list.length > 24 && <p className="mt-2 text-xs text-ink-3">And {list.length - 24} more.</p>}
    </Card>
  );
}
