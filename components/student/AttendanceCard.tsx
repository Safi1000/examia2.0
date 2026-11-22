"use client";

import { useMemo, useState } from "react";
import type { Database } from "@/lib/data/seed";
import { attendancePercent, countedDays } from "@/lib/data/selectors";
import { cn } from "@/lib/cn";
import { SectionTitle } from "@/components/student/PortalKit";

/** "2026-11" for a time, in Pakistan time (classes run on Pakistan dates). */
const monthOf = (ms: number) => new Date(ms + 5 * 3_600_000).toISOString().slice(0, 7);
const monthName = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const STATUS = {
  present: { dot: "bg-success", label: "Present" },
  // Off white, not amber: amber sits too close to gold, and gold is only for the main action.
  late: { dot: "bg-ink/45", label: "Late" },
  absent: { dot: "bg-error", label: "Absent" },
} as const;

/** Fewer marks than this in a month and its percent swings too far (one absence on the 2nd reads 0%). */
const MIN_CLASSES = 3;

/**
 * The attendance headline Home and Progress share: this month once at least
 * three of its classes are marked (or I typed the month in), else last month.
 */
export function headlineAttendance(db: Pick<Database, "attendanceDays" | "attendanceMonths" | "students">, studentId: string, nowMs: number) {
  const thisMonth = monthOf(nowMs);
  const d = new Date(`${thisMonth}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const lastMonth = d.toISOString().slice(0, 7);
  const typedNow = db.attendanceMonths.some((a) => a.studentId === studentId && a.month === `${thisMonth}-01`);
  const marked = countedDays(db, studentId).filter((x) => x.date.startsWith(thisMonth)).length;
  const prev = attendancePercent(db, studentId, `${lastMonth}-01`);
  // A new student with no last month still sees this month from the first marked class.
  const now = typedNow || marked >= MIN_CLASSES || (marked > 0 && prev == null) ? attendancePercent(db, studentId, `${thisMonth}-01`) : null;
  const month = now != null ? thisMonth : prev != null ? lastMonth : null;
  return { percent: now ?? prev, month, monthName: month ? monthName(month) : null, prev: now != null ? prev : null, prevName: monthName(lastMonth) };
}

/**
 * A student's own class register: this month's attendance, last month for
 * comparison, and their last classes as a row of marks. Hidden when there is
 * no register (in-person students, or before the first class is marked).
 * Marks dated before the student joined are never shown or counted.
 */
export function AttendanceCard({ db, studentId, nowMs }: { db: Pick<Database, "attendanceDays" | "attendanceMonths" | "students">; studentId: string; nowMs: number }) {
  const data = useMemo(() => {
    const days = countedDays(db, studentId).sort((a, b) => a.date.localeCompare(b.date));
    const head = headlineAttendance(db, studentId, nowMs);
    const inMonth = head.month ? days.filter((x) => x.date.startsWith(head.month!)) : [];
    return {
      percent: head.percent,
      headMonth: head.month,
      prev: head.prev,
      prevName: head.prevName,
      counts: {
        present: inMonth.filter((x) => x.status === "present").length,
        late: inMonth.filter((x) => x.status === "late").length,
        absent: inMonth.filter((x) => x.status === "absent").length,
      },
      recent: days.slice(-20),
    };
  }, [db, studentId, nowMs]);
  const [picked, setPicked] = useState<string | null>(null);

  if (data.percent == null || !data.headMonth) return null;
  const pct = Math.round(data.percent);
  const diff = data.prev != null ? Math.round(data.percent - data.prev) : null;
  // Two levels: plain from 75%, red below (status is green or red, never amber).
  const tone = pct >= 75 ? "text-ink" : "text-error";

  return (
    <section className="surface rounded-card p-5 sm:p-6" aria-labelledby="att-h">
      <SectionTitle
        size="card"
        id="att-h"
        sub={monthName(data.headMonth)}
        action={
          <div className="text-right">
            <p className={cn("text-title font-bold leading-none tabular-nums", tone)}>{pct}%</p>
            {diff != null && diff !== 0 && (
              <p className="mt-1.5 text-sm font-semibold text-ink-2 tabular-nums">
                {diff > 0 ? "Up" : "Down"} {Math.abs(diff)} {Math.abs(diff) === 1 ? "point" : "points"} on {data.prevName}
              </p>
            )}
          </div>
        }
      >
        Attendance
      </SectionTitle>

      {data.recent.length > 0 && (
        <>
          {/* Phones: two rows of ten, so each mark stays wide enough to see and tap. */}
          <ol className="mt-4 grid grid-cols-10 gap-1 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-fr" aria-label="Your last classes">
            {data.recent.map((x) => {
              const text = `${dayLabel(x.date)}: ${STATUS[x.status].label}`;
              const on = picked === x.id;
              return (
                <li key={x.id} className="flex justify-center">
                  {/* Tap a mark to see its day; the button is full height so it's easy to hit. */}
                  <button
                    type="button"
                    onClick={() => setPicked(on ? null : x.id)}
                    aria-pressed={on}
                    aria-label={text}
                    title={text}
                    className="flex h-11 w-full items-center justify-center rounded-field"
                  >
                    <span
                      className={cn(
                        "h-7 w-full max-w-3 rounded-full transition-opacity duration-150",
                        STATUS[x.status].dot,
                        x.status === "present" && !on && "opacity-75",
                        on && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-1 text-sm text-ink-3" aria-live="polite">
            {(() => {
              const x = data.recent.find((r) => r.id === picked);
              return x ? <span className="font-semibold text-ink-2">{`${dayLabel(x.date)}: ${STATUS[x.status].label}`}</span> : data.recent.length === 1 ? "Your last class. Tap it to see its day." : `Your last ${data.recent.length} classes, oldest first. Tap one to see its day.`;
            })()}
          </p>
        </>
      )}

      <p className="label-quiet mt-5 border-t border-hairline pt-4 text-ink-3">In {monthName(data.headMonth)}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {(["present", "late", "absent"] as const).map((k) => (
          <div key={k}>
            <dt className="flex items-center justify-center gap-1.5 text-xs text-ink-3">
              <span className={cn("h-2 w-2 rounded-full", STATUS[k].dot)} aria-hidden />
              {STATUS[k].label}
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-ink">{data.counts[k]}</dd>
          </div>
        ))}
      </dl>
      {pct < 85 && <p className="mt-4 text-sm text-ink-2">Every class you make is a topic you don&apos;t have to catch up on alone.</p>}
    </section>
  );
}
