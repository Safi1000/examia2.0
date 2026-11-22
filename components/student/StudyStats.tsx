"use client";

import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { LEVELS, STUDY_NAME, currentStats, levelFor, mondayOf } from "@/lib/focus";
import { addDays, pkDate } from "@/lib/timetable";
import { Avatar } from "@/components/student/Avatar";
import { ProgressRing } from "@/components/student/PortalKit";
import { Card } from "@/components/ui";
import { useState } from "react";

const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const WEEKS = 12;

/**
 * Progress → the student's study time: level and what unlocks next, a
 * 12-week study calendar (darker = more minutes), and this week by subject.
 */
export function StudyStats({ nowMs }: { nowMs: number }) {
  const { profile, session } = useAuth();
  const db = useDatabase();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  // No avatar picked yet: their initials, as in the header.
  const initials = student ? displayName(student.username).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "";
  const stats = currentStats(profile.focus, nowMs);
  const total = stats.totalMinutes ?? 0;
  const level = levelFor(total);
  const today = pkDate(nowMs);
  const start = addDays(mondayOf(today), -7 * (WEEKS - 1));
  const days = stats.days ?? {};
  // Off white steps, never gold: gold is kept for the page's one main action.
  const shade = (m: number) =>
    m <= 0 ? "var(--color-surface-2)" : m < 30 ? "rgba(240,237,232,0.1)" : m < 60 ? "rgba(240,237,232,0.22)" : m < 120 ? "rgba(240,237,232,0.4)" : "rgba(240,237,232,0.7)";
  const subjects = Object.entries(stats.bySubject).sort((a, b) => b[1] - a[1]);
  const weekTotal = subjects.reduce((a, [, m]) => a + m, 0);
  // This level so far, in minutes, against the minutes the level spans. Rounded down, never up.
  const levelSpan = level.next ? (level.next.hours - level.hours) * 60 : 0;
  const levelDone = level.next ? Math.min(levelSpan, Math.floor(total - level.hours * 60)) : 0;
  const hrs = (min: number) => `${Math.floor(min / 6) / 10}`;
  // A tapped day: its date and minutes show under the calendar (phones have no hover).
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar id={profile.avatar} initials={initials} level={level.index} className="h-16 w-16 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="label-quiet text-ink-3">{STUDY_NAME}</p>
          <p className="text-lg font-bold text-ink">
            {level.name} <span className="text-sm font-medium text-ink-3">· {hrs(total)} h studied</span>
          </p>
          {level.next ? (
            <div className="mt-2 flex items-center gap-3">
              <span aria-hidden>
                <ProgressRing done={levelDone} total={levelSpan} size={28} />
              </span>
              <p className="min-w-0 text-sm text-ink-3">
                {hrs(levelDone)} of {hrs(levelSpan)} h to {level.next.name}, and a new avatar frame
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-2">Top level reached.</p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-base font-semibold text-ink">Study calendar</p>
        <div className="flex max-w-md gap-[3px]" role="group" aria-label="Study minutes per day for the last 12 weeks">
          {Array.from({ length: WEEKS }, (_, w) => (
            <div key={w} className="flex flex-1 flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, d) => {
                const day = addDays(start, w * 7 + d);
                const m = day > today ? -1 : (days[day] ?? 0);
                if (m < 0) return <span key={d} aria-hidden className="aspect-square w-full" />;
                const text = `${dayLabel(day)}: ${m ? `${m} min` : "no study"}`;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPicked(picked === day ? null : day)}
                    aria-pressed={picked === day}
                    aria-label={text}
                    title={text}
                    className={`aspect-square w-full rounded-[3px] ${picked === day ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : ""}`}
                    style={{ background: shade(m) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-3" aria-live="polite">
          {picked ? (
            <span className="font-semibold text-ink-2">{`${dayLabel(picked)}: ${days[picked] ? `${days[picked]} min` : "no study"}`}</span>
          ) : (
            `${stats.streak > 1 ? `${stats.streak} day streak. ` : ""}Each square is a day; brighter means more study. Tap one to see it.`
          )}
        </p>
      </div>

      {subjects.length > 0 && (
        <div>
          <p className="mb-2 text-base font-semibold text-ink">This week</p>
          {/* Each subject's share of the week as a small ring, then its minutes. */}
          <ul className="space-y-2">
            {subjects.map(([sub, m]) => (
              <li key={sub} className="flex min-h-8 items-center gap-3 text-sm">
                <span aria-hidden>
                  <ProgressRing done={m} total={weekTotal} size={20} stroke={2.5} />
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{sub}</span>
                <span className="shrink-0 text-right tabular-nums text-ink">{m} min</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-ink-3">Levels: {LEVELS.map((l) => `${l.name} ${l.hours} h`).join(" · ")}</p>
    </Card>
  );
}
