"use client";

import { useMemo, useState } from "react";
import type { Database } from "@/lib/data/seed";
import { attendancePercent } from "@/lib/data/selectors";
import { cn } from "@/lib/cn";

/** "2026-11" for a time, in Pakistan time (classes run on Pakistan dates). */
const monthOf = (ms: number) => new Date(ms + 5 * 3_600_000).toISOString().slice(0, 7);
const monthName = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const STATUS = {
  present: { dot: "bg-success", label: "Present" },
  late: { dot: "bg-warning", label: "Late" },
  absent: { dot: "bg-error", label: "Absent" },
} as const;

/**
 * A student's own class register: this month's attendance, last month for
 * comparison, and their last classes as a row of marks. Hidden when there is
 * no register (in-person students, or before the first class is marked).
 */
export function AttendanceCard({ db, studentId, nowMs }: { db: Pick<Database, "attendanceDays" | "attendanceMonths">; studentId: string; nowMs: number }) {
  const data = useMemo(() => {
    const days = db.attendanceDays.filter((a) => a.studentId === studentId).sort((a, b) => a.date.localeCompare(b.date));
    const thisMonth = monthOf(nowMs);
    const d = new Date(`${thisMonth}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const lastMonth = d.toISOString().slice(0, 7);
    // Before this month's first class, show last month as the headline.
    const now = attendancePercent(db as Database, studentId, `${thisMonth}-01`);
    const prev = attendancePercent(db as Database, studentId, `${lastMonth}-01`);
    const headMonth = now != null ? thisMonth : prev != null ? lastMonth : null;
    const inMonth = headMonth ? days.filter((x) => x.date.startsWith(headMonth)) : [];
    return {
      percent: now ?? prev,
      headMonth,
      prev: now != null ? prev : null,
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
  const tone = pct >= 90 ? "text-success" : pct >= 75 ? "text-ink" : "text-warning";

  return (
    <section className="surface rounded-xl p-5 sm:p-6" aria-labelledby="att-h">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="att-h" className="text-[17px] font-bold tracking-[-0.01em] text-ink">Attendance</h2>
          <p className="text-sm text-ink-3">{monthName(data.headMonth)}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-3xl font-extrabold leading-none tabular-nums", tone)}>{pct}%</p>
          {diff != null && diff !== 0 && (
            <p className={cn("mt-1.5 text-xs font-semibold", diff > 0 ? "text-success" : "text-warning")}>
              {diff > 0 ? "Up" : "Down"} {Math.abs(diff)}% on last month
            </p>
          )}
        </div>
      </div>

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
                    className="flex h-11 w-full items-center justify-center rounded-md"
                  >
                    <span
                      className={cn(
                        "h-7 w-full max-w-3 rounded-full transition",
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
          <p className="mt-1 text-xs text-ink-3" aria-live="polite">
            {(() => {
              const x = data.recent.find((r) => r.id === picked);
              return x ? <span className="font-semibold text-ink-2">{`${dayLabel(x.date)}: ${STATUS[x.status].label}`}</span> : `Your last ${data.recent.length} classes, oldest first. Tap one to see its day.`;
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
