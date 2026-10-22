"use client";

import { useAuth } from "@/lib/auth-context";
import { LEVELS, STUDY_NAME, currentStats, levelFor, mondayOf } from "@/lib/focus";
import { addDays, pkDate } from "@/lib/timetable";
import { Avatar } from "@/components/student/Avatar";
import { Card } from "@/components/ui";

const WEEKS = 12;

/**
 * Progress → the student's study time: level and what unlocks next, a
 * 12-week study calendar (darker = more minutes), and this week by subject.
 */
export function StudyStats({ nowMs }: { nowMs: number }) {
  const { profile } = useAuth();
  const stats = currentStats(profile.focus, nowMs);
  const total = stats.totalMinutes ?? 0;
  const level = levelFor(total);
  const today = pkDate(nowMs);
  const start = addDays(mondayOf(today), -7 * (WEEKS - 1));
  const days = stats.days ?? {};
  const shade = (m: number) =>
    m <= 0 ? "var(--color-surface-2)" : m < 30 ? "rgba(251,193,89,0.3)" : m < 60 ? "rgba(251,193,89,0.55)" : m < 120 ? "rgba(251,193,89,0.8)" : "#FBC159";
  const subjects = Object.entries(stats.bySubject).sort((a, b) => b[1] - a[1]);
  const weekMax = Math.max(1, ...subjects.map(([, m]) => m));

  return (
    <Card className="space-y-6 p-5">
      <div className="flex items-center gap-4">
        <Avatar id={profile.avatar} initials="?" frame={level.frame} className="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-3">{STUDY_NAME}</p>
          <p className="text-lg font-extrabold text-ink">
            {level.name} <span className="text-sm font-medium text-ink-3">· {Math.round(total / 6) / 10} h studied</span>
          </p>
          {level.next ? (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, level.progress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">
                {Math.ceil(level.toNext)} h to {level.next.name}, which unlocks a new avatar frame
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-brand">Top level reached.</p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Study calendar</p>
        <div className="flex max-w-md gap-[3px]" role="img" aria-label="Study minutes per day for the last 12 weeks">
          {Array.from({ length: WEEKS }, (_, w) => (
            <div key={w} className="flex flex-1 flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, d) => {
                const day = addDays(start, w * 7 + d);
                const m = day > today ? -1 : (days[day] ?? 0);
                return (
                  <span
                    key={d}
                    title={m >= 0 ? `${day}: ${m} min` : undefined}
                    className="aspect-square w-full rounded-[3px]"
                    style={{ background: m < 0 ? "transparent" : shade(m) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {stats.streak > 1 ? `${stats.streak}-day streak. ` : ""}Each square is a day; brighter means more study.
        </p>
      </div>

      {subjects.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">This week</p>
          <ul className="space-y-2">
            {subjects.map(([sub, m]) => (
              <li key={sub} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-ink-2">{sub}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${(m / weekMax) * 100}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-ink">{m} min</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-3">Levels: {LEVELS.map((l) => `${l.name} ${l.hours} h`).join(" · ")}</p>
    </Card>
  );
}
