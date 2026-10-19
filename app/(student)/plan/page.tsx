"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById } from "@/lib/data/selectors";
import { buildStudyPlan, EXAMS, type PlanWeek } from "@/lib/study-plan";
import { TopicChip } from "@/components/student/TopicChip";
import { Card, EmptyState, Icon } from "@/components/ui";

const PHASE: Record<PlanWeek["phase"], { label: string; tasks: string[] }> = {
  learn: {
    label: "Learn and practise",
    tasks: [
      "Revise the two focus topics from your notes",
      "Do every test set this week",
      "Redo any question you dropped marks on",
    ],
  },
  "past-papers": {
    label: "Past papers",
    tasks: [
      "Two timed past papers per subject",
      "Mark them against the mark scheme",
      "Spend one session on the focus topic",
    ],
  },
  final: {
    label: "Final week",
    tasks: [
      "Light revision of your weakest topics only",
      "Check your exam timetable and room",
      "Sleep properly the night before each paper",
    ],
  },
};

const weekLabel = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function PlanPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const plan = useMemo(() => (student ? buildStudyPlan(db, student, nowMs) : null), [db, student, nowMs]);

  if (!student || !plan) return null;

  if (plan.weeks.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState icon={<Icon.Flag />} title="Exams are here" message="Good luck. Rest well and trust the work you've done." />
      </div>
    );
  }

  const current = plan.weeks.find((w) => w.isCurrent) ?? plan.weeks[0];
  const upcoming = plan.weeks.filter((w) => w.index > current.index);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-ink sm:text-3xl">Your plan to the exams</h1>
        <p className="mt-1.5 text-base text-ink-2">
          It rebuilds itself from your marks, so weak topics come round more often.
        </p>
      </header>

      {/* Countdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-ink-2">Days to {EXAMS.name}</p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-brand">{plan.daysLeft}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-ink-2">Weeks left</p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-ink">{plan.weeksLeft}</p>
        </div>
      </div>

      {/* This week */}
      <Card className="border-brand/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">This week</h2>
          <p className="text-sm text-ink-2">
            Week of {weekLabel(current.start)} · {PHASE[current.phase].label}
          </p>
        </div>

        {current.topics.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold text-ink-2">Focus topics</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {current.topics.map((t) => <TopicChip key={`${t.subject}|${t.name}`} t={t} />)}
            </div>
          </>
        )}

        <p className="mt-5 text-sm font-semibold text-ink-2">To do</p>
        <ul className="mt-2 space-y-2.5">
          {current.tests.map((t) => (
            <li key={t.id} className="flex items-start gap-3 text-[15px] text-ink">
              <Icon.Doc className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <Link href="/dashboard" className="hover:text-brand">Test: {t.title}</Link>
            </li>
          ))}
          {PHASE[current.phase].tasks.map((task) => (
            <li key={task} className="flex items-start gap-3 text-[15px] text-ink">
              <Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              {task}
            </li>
          ))}
        </ul>
      </Card>

      {/* The road ahead */}
      {upcoming.length > 0 && (
        <section aria-labelledby="ahead">
          <h2 id="ahead" className="text-base font-semibold text-ink">The weeks ahead</h2>
          <ol className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
            {upcoming.map((w) => (
              <li key={w.index} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="shrink-0 text-sm text-ink-2">
                  <span className="font-semibold text-ink">{weekLabel(w.start)}</span> · {PHASE[w.phase].label}
                </span>
                <span className="text-sm text-ink-2 sm:text-right">
                  {w.topics.length ? w.topics.map((t) => t.name).join(", ") : w.phase === "final" ? "Light revision" : "Past papers"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-sm text-ink-3">
        Dates are a guide: exams are taken to start around {new Date(`${EXAMS.start}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Your own timetable from school wins.
      </p>
    </div>
  );
}
