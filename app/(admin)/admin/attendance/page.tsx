"use client";

import { useMemo, useState } from "react";
import type { AttendanceStatus } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { attendancePercent, archivedCohortIds } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Select, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

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

  const students = useMemo(
    () =>
      db.students
        .filter((s) => !archivedCohortIds(db).has(s.cohortId))
        .filter((s) => (cohortId ? s.cohortId === cohortId : true))
        .filter((s) => (classId ? s.classIds.includes(classId) : true))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [db, cohortId, classId],
  );

  const month = monthStart(date);

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
        subtitle={mode === "daily" ? "Everyone starts present. Tap Late or Absent to change it" : "One percentage per student"}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {(["daily", "monthly"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                mode === m ? "bg-brand text-on-brand" : "text-ink-2 hover:text-ink",
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
          onChange={(e) => setDate(mode === "daily" ? e.target.value : `${e.target.value}-01`)}
          className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink"
          aria-label={mode === "daily" ? "Date" : "Month"}
        />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Icon.Users />} title="Nobody in this class" message="Pick another class or cohort." />
      ) : mode === "daily" ? (
        <DailyRegister students={students} classId={classId || null} date={date} />
      ) : (
        <MonthlySheet students={students} month={month} onSaved={() => toast("Attendance saved.", "success")} />
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
    return (
      <Card className="divide-y divide-border p-0">
        {students.map((s) => {
          // No row means present: the register only stores the exceptions.
          // A mark made elsewhere that day (e.g. a Join tap, which is filed under
          // the level) counts too, and tapping edits that row, so a day never
          // ends up with two different marks.
          const mark =
            db.attendanceDays.find((a) => a.studentId === s.id && a.classId === classId && a.date === date) ??
            db.attendanceDays.find((a) => a.studentId === s.id && a.date === date);
          const current: AttendanceStatus = mark?.status ?? "present";
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-semibold capitalize text-ink">{s.username}</span>
              <div className="flex gap-1.5">
                {STATUS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => store.setAttendance(s.id, mark ? mark.classId : classId, date, opt.value)}
                    aria-pressed={current === opt.value}
                    className={cn(
                      "h-9 rounded-md border px-3 text-sm font-semibold transition-colors",
                      current === opt.value ? opt.tone : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
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
                className="h-10 w-24 rounded-md border border-border-strong bg-surface px-3 text-center font-mono text-sm font-semibold text-ink"
              />
              <span className="text-sm text-ink-3">%</span>
            </div>
          );
        })}
      </Card>
    );
  }
}
