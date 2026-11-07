"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { dueFor } from "@/lib/due";
import { gradeSubmission } from "@/lib/grading";
import { AnnouncementsPanel } from "@/components/student/AnnouncementsPanel";
import { ClassNow } from "@/components/student/ClassNow";
import { NotifyCard } from "@/components/student/NotifyCard";
import { TopicChip } from "@/components/student/TopicChip";
import { Icon } from "@/components/ui";
import { formatRelative, formatWhen } from "@/lib/time";
import { buildStudyPlan, type PlanWeek } from "@/lib/study-plan";
import { GRADE_FLOOR, performanceSnapshot, sameSubject, type Snapshot } from "@/lib/performance";
import { StudyBuddy, todaysMission } from "@/components/student/StudyBuddy";
import type { Profile } from "@/lib/profile";
import { displayName } from "@/lib/display-name";
import { cn } from "@/lib/cn";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

const PHASE_LABEL: Record<PlanWeek["phase"], string> = {
  learn: "Learn and practise",
  "past-papers": "Past papers",
  final: "Final week",
};

/**
 * Home: what to do now (class, open tests, work due), then where the student
 * stands (performance) and what this week is for (plan). Full lists live on
 * Tests, Homework and Progress, so nothing here repeats them.
 */
export default function DashboardPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const due = useMemo(() => (student ? dueFor(db, student, nowMs) : null), [db, student, nowMs]);
  const tests = { open: due?.openTests ?? [], next: due?.nextTest ?? null };

  // Plan, performance and today's mission are the heavy sums on Home: work them
  // out once per data change (or every 5 minutes), not on every tick.
  const hourBucket = Math.floor(nowMs / 300_000);
  const heavy = useMemo(() => {
    if (!student) return { plan: null, perf: null, mission: null };
    const at = hourBucket * 300_000;
    return { plan: buildStudyPlan(db, student, at), perf: performanceSnapshot(db, student), mission: todaysMission(db, student, at) };
  }, [db, student, hourBucket]);

  if (!student || !heavy.plan) return null;

  const dueSoon = due?.dueSoon ?? [];
  const overdue = due?.overdue ?? [];

  const { plan, perf, mission } = heavy;
  const week = plan.weeks.find((w) => w.isCurrent) ?? null;

  // One line that answers "what do I do now?".
  const first = tests.open[0];
  const status = first
    ? `${tests.open.length === 1 ? "One test" : `${tests.open.length} tests`} to do. ${first.title} closes ${formatRelative(first.closesAt, nowMs)}.`
    : overdue.length
      ? `${overdue.length === 1 ? `${overdue[0].title} is` : `${overdue.length} pieces of homework are`} overdue. Hand ${overdue.length === 1 ? "it" : "them"} in when you can.`
      : dueSoon.length
      ? `${dueSoon[0].title} is due ${formatRelative(dueSoon[0].dueAt, nowMs)}.`
      : tests.next
        ? `Nothing due. Next test opens ${formatWhen(tests.next.opensAt)}.`
        : "You're all caught up.";

  // Results out in the last 3 days sit at the end of the list, quietly.
  const newResults = db.submissions
    .filter((x) => x.studentId === student.id && x.status === "released" && x.releasedAt && nowMs - +new Date(x.releasedAt) < 3 * 86_400_000)
    .sort((a, b) => +new Date(b.releasedAt!) - +new Date(a.releasedAt!))
    .flatMap((x) => {
      const t = db.tests.find((tt) => tt.id === x.testId);
      return t ? [{ key: `r-${x.id}`, href: `/results/${t.id}`, title: t.title, meta: `Result out · ${Math.round(gradeSubmission(t, x).percent)}%`, cta: "See result", quiet: true }] : [];
    });

  const todo: Array<{ key: string; href: string; title: string; meta: string; cta: string; quiet?: boolean }> = [
    ...tests.open.map((t) => ({ key: t.id, href: `/test/${t.id}`, title: t.title, meta: `Test · closes ${formatRelative(t.closesAt, nowMs)}`, cta: "Start" })),
    // Straight to that homework on the Homework page, not the top of the list.
    ...overdue.map((a) => ({ key: a.id, href: `/assignments#a-${a.id}`, title: a.title, meta: `Homework · overdue since ${formatWhen(a.dueAt)}`, cta: "Hand in" })),
    ...dueSoon.map((a) => ({ key: a.id, href: `/assignments#a-${a.id}`, title: a.title, meta: `Homework · due ${formatWhen(a.dueAt)}`, cta: "Hand in" })),
    ...newResults,
  ];
  const toDoCount = todo.filter((x) => !x.quiet).length;

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6">
      <header className="animate-fade-up">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
          {greeting()}, {displayName(student.username).split(" ")[0]}.
        </h1>
        <p className="mt-2.5 text-base text-ink-2">{status}</p>
      </header>

      <ClassNow db={db} student={student} nowMs={nowMs} />
      <NotifyCard />

      {todo.length > 0 && (
        <section className="animate-fade-up space-y-2.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            {toDoCount > 0 ? (
              <>
                <span className="h-2 w-2 animate-low-pulse rounded-full bg-brand" /> To do
                <span className="text-sm font-medium text-ink-3 tabular-nums">{toDoCount}</span>
              </>
            ) : (
              "New for you"
            )}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {todo.map((x) => (
              <li key={x.key}>
                <Link href={x.href} className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-2 active:bg-surface-2">
                  <span className="min-w-0">
                    <span className="line-clamp-2 break-words font-semibold text-ink">{x.title}</span>
                    <span className="block text-sm text-ink-3">{x.meta}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-semibold",
                      x.quiet ? "border border-border-strong text-ink" : "bg-brand text-on-brand",
                    )}
                  >
                    {x.cta} <Icon.ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {todo.length === 0 && (
        <div className="animate-fade-up flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <Icon.Check className="h-5 w-5" />
          </span>
          <p className="text-sm text-ink-2">
            <span className="block font-semibold text-ink">Nothing due right now.</span>
            {tests.next ? `Next test opens ${formatWhen(tests.next.opensAt)}.` : "New tests and homework show up here."}
          </p>
        </div>
      )}

      {/* Hamza's notices: high up, but one line each so the day's work stays in view. */}
      <AnnouncementsPanel student={student} />

      <StudyBuddy db={db} student={student} nowMs={nowMs} mission={mission} />

      <div className="grid gap-4 sm:grid-cols-2">
        <PerformanceCard perf={perf} targets={profile.targets} />
        <PlanCard week={week} daysLeft={plan.daysLeft} />
      </div>

    </div>
  );
}

function PerformanceCard({ perf, targets }: { perf: Snapshot | null; targets?: Profile["targets"] }) {
  // Each subject against the student's own target, when they set one.
  const vsTarget = (perf?.bySubject ?? []).flatMap((s) => {
    const key = Object.keys(targets ?? {}).find((k) => sameSubject(k, s.subject));
    const target = key && typeof targets![key] === "string" && targets![key] in GRADE_FLOOR ? targets![key] : undefined;
    return target ? [{ ...s, target, gap: Math.max(0, Math.ceil(GRADE_FLOOR[target] - s.recent)) }] : [];
  });
  return (
    <Link
      href="/progress"
      className="animate-fade-up flex flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-3">Your performance</p>
      {!perf || perf.marked < 3 ? (
        <p className="mt-3 flex-1 text-sm text-ink-2">
          {perf ? `${perf.marked} of 3 tests marked. ` : ""}Your grade shows here after three marked tests.
        </p>
      ) : (
        <div className="mt-3 flex-1">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-extrabold leading-none tracking-tight text-brand">{perf.grade}</span>
              <span className="pb-1 text-sm text-ink-2">
                <span className="font-semibold tabular-nums text-ink">{Math.round(perf.recent)}%</span> avg
                <br />
                <span className="text-xs text-ink-3">last {Math.min(5, perf.marked)} tests</span>
              </span>
            </div>
            <Sparkline points={perf.points} />
          </div>
          {perf.delta != null && Math.abs(perf.delta) >= 1 && (
            <p className={cn("mt-3 text-sm font-semibold", perf.delta > 0 ? "text-success" : "text-warning")}>
              {perf.delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(perf.delta))}% vs the tests before
            </p>
          )}
          {vsTarget.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {vsTarget.map((s) => (
                <li key={s.subject} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink-2">{s.subject}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-ink">{s.grade}</span>
                    <span className="text-ink-3"> → {s.target}</span>
                    {s.gap > 0 ? <span className="text-warning"> +{s.gap}%</span> : <span className="text-success"> ✓</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {perf.weakest.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              Work on:{" "}
              {perf.weakest.map((w, i) => (
                <span key={w.name}>
                  {i > 0 && ", "}
                  <span className="font-semibold text-ink">{w.name}</span> <span className="text-ink-3">{w.percent}%</span>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        Full progress <Icon.ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function PlanCard({ week, daysLeft }: { week: PlanWeek | null; daysLeft: number }) {
  return (
    <Link
      href="/plan"
      className="animate-fade-up flex flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
      style={{ animationDelay: "40ms" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-3">This week</p>
        <span className="text-sm tabular-nums text-ink-2">
          <span className="font-bold text-brand">{daysLeft}</span> days to exams
        </span>
      </div>
      <div className="mt-3 flex-1">
        <p className="font-semibold text-ink">{week ? PHASE_LABEL[week.phase] : "Your plan"}</p>
        {week && week.topics.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {week.topics.map((t) => (
              <TopicChip key={`${t.subject}|${t.name}`} t={t} />
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-ink-2">Revise this week&apos;s class topics from your notes.</p>
        )}
        {week && week.tests.length > 0 && (
          <p className="mt-2.5 text-sm text-ink-3">
            {week.tests.length === 1 ? "1 test" : `${week.tests.length} tests`} this week
          </p>
        )}
      </div>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        See your full plan <Icon.ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** Last few results as a tiny line (no axes: the shape is the point). */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 36;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 3 - (Math.max(0, Math.min(100, p)) / 100) * (h - 6)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={lx} cy={ly} r="3" fill="var(--color-brand)" />
    </svg>
  );
}
