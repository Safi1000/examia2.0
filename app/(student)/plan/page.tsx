"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById, testById } from "@/lib/data/selectors";
import { buildStudyPlan, EXAMS, type PlanWeek } from "@/lib/study-plan";
import { dueFor } from "@/lib/due";
import { formatWhen } from "@/lib/time";
import { TopicChip } from "@/components/student/TopicChip";
import { topicNotesFinder } from "@/components/student/topic-notes";
import { EmptyState, Icon } from "@/components/ui";
import { PageHeader, SectionTitle } from "@/components/student/PortalKit";

/** A task with `href` opens where it is done; the rest are reminders. */
type Task = string | { text: string; href: string };
const PHASE: Record<PlanWeek["phase"], { label: string; tasks: Task[] }> = {
  learn: {
    label: "Learn and practise",
    tasks: [
      { text: "Revise this week's focus topics (or class topics) from your notes", href: "/notes" },
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
const taskText = (t: Task) => (typeof t === "string" ? t : t.text);
/** The day the countdown counts to (the same date the footer names). */
const examStart = (opts: Intl.DateTimeFormatOptions) => new Date(`${EXAMS.start}T00:00:00`).toLocaleDateString("en-GB", opts);
const rowLink = "-my-3 flex min-h-11 flex-1 items-center gap-3 py-3 underline-offset-4 hover:underline";

export default function PlanPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const plan = useMemo(() => (student ? buildStudyPlan(db, student, nowMs) : null), [db, student, nowMs]);
  // Homework from the same list Home uses, and each focus topic's notes.
  const due = useMemo(() => (student ? dueFor(db, student, nowMs) : null), [db, student, nowMs]);
  const notesFor = useMemo(() => (student ? topicNotesFinder(db, student) : null), [db, student]);

  if (!student || !plan) return null;
  const homework = [...(due?.overdue ?? []), ...(due?.dueSoon ?? [])];

  if (plan.weeks.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
        <EmptyState icon={<Icon.Flag />} title="Exams are here" message="Good luck. Rest well and trust the work you've done." />
      </div>
    );
  }

  const current = plan.weeks.find((w) => w.isCurrent) ?? plan.weeks[0];
  const upcoming = plan.weeks.filter((w) => w.index > current.index);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="Your plan to the exams">
        It rebuilds itself from your marks, so weak topics come round more often.
      </PageHeader>

      {/* Countdown: one surface, two numbers split by a hairline. */}
      <div className="surface grid grid-cols-2 divide-x divide-hairline rounded-xl">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm text-ink-2">Days to exams</p>
          <p className="mt-1.5 text-[2.75rem] font-extrabold leading-none tracking-[-0.03em] text-brand tabular-nums">{plan.daysLeft}</p>
          <p className="mt-2 text-xs text-ink-3">Until {examStart({ day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm text-ink-2">Weeks left</p>
          <p className="mt-1.5 text-[2.75rem] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">{plan.weeksLeft}</p>
        </div>
      </div>

      {/* This week */}
      <section className="surface rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">This week</h2>
          <p className="text-sm text-ink-2">
            Week of {weekLabel(current.start)} · {PHASE[current.phase].label}
          </p>
        </div>

        {current.topics.length > 0 && (
          <>
            <p className="label-quiet mt-6 text-ink-3">Focus topics</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {current.topics.map((t) => {
                const notes = notesFor?.(t.subject, t.name);
                return <TopicChip key={`${t.subject}|${t.name}`} t={t} href={notes?.href} label={notes?.label} />;
              })}
            </div>
          </>
        )}

        <p className="label-quiet mt-6 text-ink-3">To do</p>
        <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
          {current.tests.map((t) => {
            // Not open yet: say when it opens, so it doesn't look doable today.
            const opensAt = testById(db, t.id)?.opensAt;
            const open = !opensAt || nowMs >= +new Date(opensAt);
            return (
              <li key={t.id} className="flex items-center gap-3 py-3 text-base text-ink">
                {open ? (
                  <Link href={`/test/${t.id}`} className={rowLink}>
                    <Icon.Doc className="h-4 w-4 shrink-0 text-ink-2" />
                    <span className="min-w-0 flex-1 font-semibold">Test: {t.title}</span>
                    <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                  </Link>
                ) : (
                  <>
                    <Icon.Lock className="h-4 w-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-2">Test: {t.title}</span>
                      <span className="block text-sm text-ink-3">Opens {formatWhen(opensAt!)}</span>
                    </span>
                  </>
                )}
              </li>
            );
          })}
          {homework.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3 text-base text-ink">
              <Link href={`/assignments#a-${a.id}`} className={rowLink}>
                <Icon.Camera className="h-4 w-4 shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Homework: {a.title}</span>
                  <span className="block text-sm text-ink-3">
                    {+new Date(a.dueAt) <= nowMs ? "Overdue since" : "Due"} {formatWhen(a.dueAt)}
                  </span>
                </span>
                <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
          {PHASE[current.phase].tasks.map((task) => (
            <li key={taskText(task)} className="flex items-center gap-3 py-3 text-base text-ink">
              {typeof task === "string" ? (
                <>
                  {/* A plain dot: a reminder, not something to tick off. */}
                  <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-3" />
                  </span>
                  {task}
                </>
              ) : (
                <Link href={task.href} className={rowLink}>
                  <Icon.Doc className="h-4 w-4 shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1">{task.text}</span>
                  <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                </Link>
              )}
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

      <p className="text-sm text-ink-3">
        Dates are a guide: the {EXAMS.name} exams are taken to start around {examStart({ day: "numeric", month: "long", year: "numeric" })}. Your own timetable from school wins.
      </p>
      </div>
    </div>
  );
}
