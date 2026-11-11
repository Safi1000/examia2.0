"use client";

import { cohortById } from "@/lib/data/selectors";
import { useMemo, useState } from "react";
import type { AttendanceStatus } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { attendancePercent, archivedCohortIds } from "@/lib/data/selectors";
import { isInPersonStudent } from "@/lib/in-person";
import { isTestAccount } from "@/lib/display-name";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Select, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useClassLinks } from "@/lib/classes";

type Mode = "daily" | "monthly";

const STATUS: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: "present", label: "Present", tone: "border-success bg-success-soft text-success" },
  { value: "late", label: "Late", tone: "border-warning bg-warning-soft text-warning" },
  { value: "absent", label: "Absent", tone: "border-error bg-error-soft text-error" },
];

// Pakistan date, so early-morning marks never land on yesterday.
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

export default function AttendancePage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [mode, setMode] = useState<Mode>("daily");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO);

  const students = useMemo(() => {
    const off = archivedCohortIds(db);
    return (
      db.students
        .filter((s) => !off.has(s.cohortId))
        // In-person students have no register.
        .filter((s) => !isInPersonStudent(db, s))
        .filter((s) => (cohortId ? s.cohortId === cohortId : true))
        // Their own classes, else their cohort's (the same rule the portal uses).
        .filter((s) => (classId ? (s.classIds.length ? s.classIds : (cohortById(db, s.cohortId)?.classIds ?? [])).includes(classId) : true))
        .sort((a, b) => a.username.localeCompare(b.username))
    );
  }, [db, cohortId, classId]);

  const month = monthStart(date);
  // Who tapped Join on this day (and when), so the register shows who actually came.
  const { joins } = useClassLinks(date, date, true, date === todayISO());

  if (db.students.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <PageHeader title="Attendance" />
        <EmptyState icon={<Icon.Users />} title="No students yet" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Attendance"
        subtitle={
          mode === "daily"
            ? "Filled in by itself from Join taps: late after 10 minutes, absent for no-shows after class. Tap to change any mark."
            : "One percentage per student"
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(["daily", "monthly"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "min-h-9 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors max-md:min-h-10",
                mode === m ? "bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-ink-3 hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-auto min-w-40" aria-label="Class">
          <option value="">All classes</option>
          {db.classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        <input
          type={mode === "daily" ? "date" : "month"}
          value={mode === "daily" ? date : date.slice(0, 7)}
          // The picker's Clear button sends an empty value: keep the last real date, or marks would be saved with no day.
          // A typed future date is ignored too: `max` only limits the picker, not the keyboard.
          onChange={(e) => e.target.value && e.target.value <= e.target.max && setDate(mode === "daily" ? e.target.value : `${e.target.value}-01`)}
          max={mode === "daily" ? todayISO() : todayISO().slice(0, 7)}
          className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink max-md:h-11"
          aria-label={mode === "daily" ? "Date" : "Month"}
        />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Icon.Users />} title="Nobody in this class" message="Pick another class or cohort." />
      ) : mode === "daily" ? (
        // Called as functions, not <Components />: declared inside this page, they would
        // remount on every save and drop the focus from the next field.
        DailyRegister({ students, classId: classId || null, date })
      ) : (
        MonthlySheet({ students, month, onSaved: () => toast("Attendance saved.", "success") })
      )}
    </div>
  );

  function DailyRegister({
    students,
    classId,
    date,
  }: {
    students: typeof db.students;
    classId: string | null;
    date: string;
  }) {
    // A mark made elsewhere that day (e.g. a Join tap, filed under the level) counts too, and
    // tapping edits that row, so a day never ends up with two different marks.
    const markOf = (id: string) =>
      db.attendanceDays.find((a) => a.studentId === id && a.classId === classId && a.date === date) ??
      db.attendanceDays.find((a) => a.studentId === id && a.date === date);
    const firstJoin = (id: string) =>
      joins
        .filter((j) => j.studentId === id && (!classId || j.classId === classId))
        .sort((x, y) => x.joinedAt.localeCompare(y.joinedAt))[0];
    const rows = students.map((s) => ({ s, mark: markOf(s.id), join: firstJoin(s.id) }));
    const count = (st: AttendanceStatus) => rows.filter((r) => r.mark?.status === st).length;
    // Hamza's own test account keeps its row (tap to mark it) but is never
    // counted as "not marked" or swept up by "Mark the rest".
    const unmarked = rows.filter((r) => !r.mark && !isTestAccount(r.s));
    const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true });
    const markRest = (status: AttendanceStatus) => {
      for (const r of unmarked) store.setAttendance(r.s.id, classId, date, status);
      toast(`${unmarked.length} marked ${status}.`, "success");
    };

    return (
      <>
        {/* The day at a glance, and one tap for everyone not marked yet. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-semibold text-success">{count("present")} present</span>
          <span className="font-semibold text-warning">{count("late")} late</span>
          <span className="font-semibold tabular-nums text-error">{count("absent")} absent</span>
          <span className="tabular-nums text-ink-3">{unmarked.length} not marked</span>
          {unmarked.length > 0 && (
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => markRest("present")} className="h-10 rounded-full border border-border-strong px-3.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11">
                Mark the rest present
              </button>
              <button type="button" onClick={() => markRest("absent")} className="h-10 rounded-full border border-border-strong px-3.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11">
                Mark the rest absent
              </button>
            </span>
          )}
        </div>
        <Card className="divide-y divide-border overflow-hidden p-0">
          {rows.map(({ s, mark, join }) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.018]">
              <span className="min-w-36 flex-1">
                <span className="block truncate font-semibold capitalize text-ink">{s.username}</span>
                <span className="block text-xs tabular-nums text-ink-3">
                  {join ? `Joined ${clock(join.joinedAt)}` : "Didn't tap Join"}
                  {!mark && " · not marked yet"}
                </span>
              </span>
              {/* On a phone the three marks take their own full-width line, so the name is never squeezed. */}
              <div className="flex gap-1.5 max-sm:w-full">
                {STATUS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => store.setAttendance(s.id, mark ? mark.classId : classId, date, opt.value)}
                    aria-pressed={mark?.status === opt.value}
                    aria-label={`${opt.label}: ${s.username}`}
                    className={cn(
                      "h-11 min-w-[4.5rem] rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-sm:flex-1",
                      mark?.status === opt.value ? opt.tone : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <p className="mt-3 text-xs text-ink-3">Days with no mark are left out of the monthly percentage (late counts as half).</p>
      </>
    );
  }

  function MonthlySheet({
    students,
    month,
    onSaved,
  }: {
    students: typeof db.students;
    month: string;
    onSaved: () => void;
  }) {
    return (
      <Card className="divide-y divide-border p-0">
        {students.map((s) => {
          // Pre-filled from the daily register when it was kept, still editable.
          const value = attendancePercent(db, s.id, month);
          const fromRegister = !db.attendanceMonths.some((a) => a.studentId === s.id && a.month === month);
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-semibold capitalize text-ink">{s.username}</span>
              {fromRegister && value != null && (
                <span className="text-xs text-ink-3">from the register</span>
              )}
              <input
                key={`${s.id}-${month}`}
                type="number"
                min={0}
                max={100}
                defaultValue={value ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  // Only a real change becomes a typed figure; tabbing past leaves it live.
                  if (v === "" || Number(v) === value) return;
                  store.setMonthlyAttendance(s.id, month, Math.max(0, Math.min(100, Math.round(Number(v)))));
                  onSaved();
                }}
                placeholder="%"
                aria-label={`${s.username} attendance percent`}
                className="h-11 w-24 rounded-lg border border-border-strong bg-surface px-3 text-center text-base font-semibold tabular-nums text-ink sm:text-sm"
              />
              <span className="text-sm text-ink-3">%</span>
            </div>
          );
        })}
      </Card>
    );
  }
}
