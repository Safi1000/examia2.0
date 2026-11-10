"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById, testById } from "@/lib/data/selectors";
import { buildStudyPlan, EXAMS, type PlanWeek } from "@/lib/study-plan";
import { TopicChip } from "@/components/student/TopicChip";
import { EmptyState, Icon } from "@/components/ui";
import { PageHeader, SectionTitle } from "@/components/student/PortalKit";

const PHASE: Record<PlanWeek["phase"], { label: string; tasks: string[] }> = {
  learn: {
    label: "Learn and practise",
    tasks: [
      "Revise this week's focus topics (or class topics) from your notes",
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
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <EmptyState icon={<Icon.Flag />} title="Exams are here" message="Good luck. Rest well and trust the work you've done." />
      </div>
    );
  }

  const current = plan.weeks.find((w) => w.isCurrent) ?? plan.weeks[0];
  const upcoming = plan.weeks.filter((w) => w.index > current.index);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="Your plan to the exams">
        It rebuilds itself from your marks, so weak topics come round more often.
      </PageHeader>

      {/* Countdown: one surface, two numbers split by a hairline. */}
      <div className="surface grid grid-cols-2 divide-x divide-hairline rounded-xl">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm text-ink-2">Days to exams</p>
          <p className="mt-1.5 text-[2.75rem] font-extrabold leading-none tracking-[-0.03em] text-brand tabular-nums">{plan.daysLeft}</p>
          <p className="mt-2 text-xs text-ink-3">{EXAMS.name}</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm text-ink-2">Weeks left</p>
          <p className="mt-1.5 text-[2.75rem] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">{plan.weeksLeft}</p>
        </div>
      </div>

      {/* This week */}
      <section className="surface rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold tracking-[-0.015em] text-ink">This week</h2>
          <p className="text-sm text-ink-2">
            Week of {weekLabel(current.start)} · {PHASE[current.phase].label}
          </p>
        </div>

        {current.topics.length > 0 && (
          <>
            <p className="label-quiet mt-6 text-ink-3">Focus topics</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {current.topics.map((t) => <TopicChip key={`${t.subject}|${t.name}`} t={t} />)}
            </div>
          </>
        )}

        <p className="label-quiet mt-6 text-ink-3">To do</p>
        <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
          {current.tests.map((t) => {
            // Not open yet: Tests shows when it opens, rather than a waiting page.
            const opensAt = testById(db, t.id)?.opensAt;
            const open = !opensAt || nowMs >= +new Date(opensAt);
            return (
              <li key={t.id} className="flex items-start gap-3 py-3 text-base text-ink">
                <Icon.Doc className="mt-1 h-4 w-4 shrink-0 text-ink-2" />
                <Link href={open ? `/test/${t.id}` : "/tests"} className="-my-2.5 flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">Test: {t.title}</Link>
              </li>
            );
          })}
          {PHASE[current.phase].tasks.map((task) => (
            <li key={task} className="flex items-start gap-3 py-3 text-base text-ink">
              {/* An empty circle: a tick here made every task look done already. */}
              <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded-full border-[1.5px] border-ink-3" />
              {task}
            </li>
          ))}
        </ul>
      </section>

      {/* The road ahead */}
      {upcoming.length > 0 && (
        <section aria-labelledby="ahead">
          <SectionTitle id="ahead">The weeks ahead</SectionTitle>
          <ol className="surface divide-y divide-hairline overflow-hidden rounded-xl">
            {upcoming.map((w) => (
              <li key={w.index} className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="shrink-0 text-sm text-ink-2">
                  <span className="font-semibold text-ink tabular-nums">{weekLabel(w.start)}</span> · {PHASE[w.phase].label}
                </span>
                <span className="text-sm text-ink-2 sm:text-right">
                  {w.topics.length
                    ? w.topics.map((t) => t.name).join(", ")
                    : w.phase === "final"
                      ? "Light revision"
                      : w.phase === "learn"
                        ? "Topics from your classes"
                        : "Past papers"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="px-1 text-sm text-ink-3">
        Dates are a guide: exams are taken to start around {new Date(`${EXAMS.start}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Your own timetable from school wins.
      </p>
      </div>
    </div>
  );
}
