"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById, testById } from "@/lib/data/selectors";
import { buildStudyPlan, EXAMS, type PlanWeek } from "@/lib/study-plan";
import { cn } from "@/lib/cn";
import { dueFor } from "@/lib/due";
import { EXAM_SERIES, daysUntil, examDateLabel, nextExam, paperName } from "@/lib/exam-dates";
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
      { text: "Revise this week's topics from your notes", href: "/notes" },
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

/** "1 h 45 min", "2 h", "45 min". */
const duration = (m: number) => [m >= 60 ? `${Math.floor(m / 60)} h` : "", m % 60 ? `${m % 60} min` : ""].filter(Boolean).join(" ");
const weekLabel = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const taskText = (t: Task) => (typeof t === "string" ? t : t.text);
/** The day the countdown counts to (the same date the footer names). */
const examStart = (opts: Intl.DateTimeFormatOptions) => new Date(`${EXAMS.start}T00:00:00`).toLocaleDateString("en-GB", opts);
const rowLink = "-my-3 flex min-h-11 flex-1 items-center gap-3 py-3 underline-offset-4 hover:underline";
/** Weeks ahead shown before "Show all weeks": the near future, not a list to May. */
const AHEAD_SHOWN = 3;

export default function PlanPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const plan = useMemo(() => (student ? buildStudyPlan(db, student, nowMs) : null), [db, student, nowMs]);
  // Homework from the same list Home uses, and each focus topic's notes.
  const due = useMemo(() => (student ? dueFor(db, student, nowMs) : null), [db, student, nowMs]);
  const notesFor = useMemo(() => (student ? topicNotesFinder(db, student) : null), [db, student]);
  const [allWeeks, setAllWeeks] = useState(false);

  if (!student || !plan) return null;
  // This week's homework only (overdue, or due before next Monday); later ones are counted in a quiet line.
  const weekEnds = (() => {
    const w = plan.weeks.find((x) => x.isCurrent) ?? plan.weeks[0];
    return w ? +w.start + 7 * 86_400_000 : nowMs;
  })();
  const later = (due?.dueSoon ?? []).filter((a) => +new Date(a.dueAt) >= weekEnds);
  const homework = [...(due?.overdue ?? []), ...(due?.dueSoon ?? []).filter((a) => +new Date(a.dueAt) < weekEnds)];

  if (plan.weeks.length === 0) {
    // Every one of their papers is behind them: not "exams are here" all summer.
    const done = plan.papers.length > 0 && !nextExam(plan.papers, nowMs);
    return (
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
        {done ? (
          <EmptyState icon={<Icon.Flag />} title="Your exams are done" message="Well done for getting through them. Your next plan shows here once I add your next exam dates." />
        ) : (
          <EmptyState icon={<Icon.Flag />} title="Exams are here" message="Good luck. Rest well and trust the work you've done." />
        )}
      </div>
    );
  }

  const paper = nextExam(plan.papers, nowMs);
  const current = plan.weeks.find((w) => w.isCurrent) ?? plan.weeks[0];
  const upcoming = plan.weeks.filter((w) => w.index > current.index);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="My plan">
        Built from your marks, so your weak topics come round more often.
      </PageHeader>

      {/* Countdown: one surface, two numbers split by a hairline. */}
      <div className="surface grid grid-cols-2 divide-x divide-hairline rounded-card">
        <div className="p-5 sm:p-6">
          {/* One-line labels on both sides, so the two numbers sit on the same line. */}
          <p className="text-sm text-ink-2">{paper ? `${plan.papers[0] === paper ? "First" : "Next"} paper in` : "Exams in"}</p>
          <p className="mt-2 flex items-baseline gap-1.5 text-title-lg font-bold leading-none tracking-[-0.025em] text-ink tabular-nums">
            {plan.daysLeft}
            <span className="text-base font-semibold tracking-normal text-ink-2">{plan.daysLeft === 1 ? "day" : "days"}</span>
          </p>
          <p className="mt-2 text-sm text-ink-3">
            {paper ? `${paperName(paper)}, ${examDateLabel(paper.date, nowMs)}` : `Until ${examStart({ day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <p className="text-sm text-ink-2">Weeks to go</p>
          <p className="mt-2 text-title-lg font-bold leading-none tracking-[-0.025em] text-ink tabular-nums">{plan.weeksLeft}</p>
        </div>
      </div>

      {/* Their own papers, in the order they are sat. */}
      {plan.papers.length > 0 && (
        <section aria-labelledby="papers-title">
          <SectionTitle id="papers-title" count={plan.papers.length}>
            Your papers
          </SectionTitle>
          <ol className="surface divide-y divide-hairline overflow-hidden rounded-card">
            {plan.papers.map((p) => {
              const d = daysUntil(p.date, nowMs);
              return (
                <li key={`${p.level}-${p.subject}-${p.paper}`} className={cn("flex items-center gap-4 px-5 py-3.5 sm:px-6", d < 0 && "opacity-55")}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-ink">{paperName(p)}</span>
                    {/* Each fact stays whole; the line only ever breaks between facts. */}
                    <span className="flex flex-wrap gap-x-1.5 text-sm text-ink-2 tabular-nums [&>span]:whitespace-nowrap">
                      <span>{examDateLabel(p.date, nowMs)}</span>
                      <span><span aria-hidden className="text-ink-3">· </span>{duration(p.minutes)}</span>
                      {p.multipleChoice && <span><span aria-hidden className="text-ink-3">· </span>multiple choice</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums text-ink-2">
                    {d < 0 ? "Done" : d === 0 ? <span className="font-semibold text-ink">Today</span> : <><span className="text-base font-bold text-ink">{d}</span> {d === 1 ? "day" : "days"}</>}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-sm text-ink-3">
            Dates from {EXAM_SERIES.source}. If your statement of entry shows a different date, that one is right: tell me.
          </p>
        </section>
      )}

      {/* This week */}
      <section className="surface rounded-card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle size="card">This week</SectionTitle>
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
                    <Icon.Doc className="h-5 w-5 shrink-0 text-ink-2" />
                    <span className="min-w-0 flex-1 font-semibold">Test: {t.title}</span>
                    <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                  </Link>
                ) : (
                  <>
                    <Icon.Lock className="h-5 w-5 shrink-0 text-ink-3" />
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
                <Icon.Camera className="h-5 w-5 shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Homework: {a.title}</span>
                  <span className="block text-sm text-ink-3">
                    {+new Date(a.dueAt) <= nowMs ? "Overdue since" : "Due"} {formatWhen(a.dueAt)}
                  </span>
                </span>
                <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
              </Link>
            </li>
          ))}
          {later.length > 0 && (
            <li className="py-3 text-sm text-ink-3">
              And {later.length} more {later.length === 1 ? "piece" : "pieces"} of homework due later.
            </li>
          )}
          {PHASE[current.phase].tasks.map((task) => (
            <li key={taskText(task)} className="flex items-center gap-3 py-3 text-base text-ink">
              {typeof task === "string" ? (
                <>
                  {/* A plain dot: a reminder, not something to tick off. */}
                  <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-3" />
                  </span>
                  {task}
                </>
              ) : (
                <Link href={task.href} className={rowLink}>
                  <Icon.Doc className="h-5 w-5 shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1">{task.text}</span>
                  <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
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
          <ol className="surface divide-y divide-hairline overflow-hidden rounded-card">
            {(allWeeks ? upcoming : upcoming.slice(0, AHEAD_SHOWN)).map((w) => (
              <li key={w.index} className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="shrink-0 text-base text-ink-2">
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
          {upcoming.length > AHEAD_SHOWN && (
            <button
              type="button"
              onClick={() => setAllWeeks(!allWeeks)}
              className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              {allWeeks ? "Show fewer weeks" : `Show all ${upcoming.length} weeks`}
            </button>
          )}
        </section>
      )}

      {plan.papers.length === 0 && (
        <p className="text-sm text-ink-3">
          Dates are a guide. I count down to {examStart({ day: "numeric", month: "long", year: "numeric" })}, roughly when the {EXAMS.name} exams start. Your own exam timetable always wins.
        </p>
      )}
      </div>
    </div>
  );
}
