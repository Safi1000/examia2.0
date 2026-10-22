"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { studentById, testsForStudent, submissionFor } from "@/lib/data/selectors";
import { AnnouncementsPanel } from "@/components/student/AnnouncementsPanel";
import { TestCard } from "@/components/student/TestCard";
import { EmptyState, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatRelative, testWindow } from "@/lib/time";
import { buildStudyPlan } from "@/lib/study-plan";
import { TopicChip } from "@/components/student/TopicChip";
import { displayName } from "@/lib/display-name";
import { AddToCalendar } from "@/components/student/AddToCalendar";
import { ClassNow } from "@/components/student/ClassNow";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

export default function DashboardPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();

  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const groups = useMemo(() => {
    if (!student) return { open: [], upcoming: [], past: [] };
    const tests = testsForStudent(db, student).sort(
      (a, b) => +new Date(a.opensAt) - +new Date(b.opensAt),
    );
    const open = [], upcoming = [], past = [];
    for (const t of tests) {
      const w = testWindow(t.opensAt, t.closesAt, nowMs);
      const sub = submissionFor(db, student.id, t.id);
      if (w === "open" && !sub) open.push(t);
      else if (w === "future") upcoming.push(t);
      else past.push(t);
    }
    return { open, upcoming, past };
  }, [db, student, nowMs]);

  if (!student) return null;

  const plan = buildStudyPlan(db, student, nowMs);
  const thisWeek = plan.weeks.find((w) => w.isCurrent);

  const hasAny = groups.open.length + groups.upcoming.length + groups.past.length > 0;

  // One line that answers "what do I do now?" before anything else.
  const soonest = [...groups.open].sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt))[0];
  const status = soonest
    ? `${groups.open.length === 1 ? "One test" : `${groups.open.length} tests`} to do. ${soonest.title} closes ${formatRelative(soonest.closesAt, nowMs)}.`
    : groups.upcoming.length
      ? "Nothing due right now. Your next test is listed below."
      : "You're all caught up.";

  return (
    <div className="mx-auto max-w-3xl space-y-9 px-4 py-8 sm:px-6">
      <header className="animate-fade-up">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
          {greeting()}, {displayName(student.username).split(" ")[0]}.
        </h1>
        <p className="mt-2.5 text-base text-ink-2">{status}</p>
      </header>

      <ClassNow db={db} student={student} nowMs={nowMs} />

      {!hasAny && (
        <EmptyState
          icon={<Icon.Doc />}
          title="No tests yet"
          message="Nothing to do right now. New tests and work will show up here."
        />
      )}

      {groups.open.length > 0 && (
        <Section title="Your move" tone="brand">
          {groups.open.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
        </Section>
      )}

      {thisWeek && (
        <Link
          href="/plan"
          className="animate-fade-up block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
          style={{ animationDelay: "40ms" }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">This week&apos;s focus</h2>
            <span className="shrink-0 text-sm tabular-nums text-ink-2">
              <span className="font-bold text-brand">{plan.daysLeft}</span> days to exams
            </span>
          </div>
          {thisWeek.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {thisWeek.topics.map((t) => <TopicChip key={`${t.subject}|${t.name}`} t={t} />)}
            </div>
          )}
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            See your full plan <Icon.ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
        <AnnouncementsPanel student={student} />
      </div>

      {groups.upcoming.length > 0 && (
        <Section title="Coming up">
          {groups.upcoming.map((t) => (
            <div key={t.id}>
              <TestCard test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
              <div className="mt-1.5 flex justify-end pr-1">
                <AddToCalendar test={t} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {groups.past.length > 0 && (
        <Section title="Done &amp; dusted">
          {groups.past.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
        </Section>
      )}

      <Link
        href="/classes"
        className={buttonClasses({ variant: "secondary", fullWidth: true, className: "justify-between" })}
      >
        <span className="inline-flex items-center gap-2"><Icon.Clock className="h-[18px] w-[18px]" /> Timetable and recordings</span>
        <Icon.ChevronRight className="h-[18px] w-[18px]" />
      </Link>

      <Link
        href="/progress"
        className={buttonClasses({ variant: "secondary", fullWidth: true, className: "justify-between" })}
      >
        <span className="inline-flex items-center gap-2"><Icon.Chart className="h-[18px] w-[18px]" /> View my progress</span>
        <Icon.ChevronRight className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "brand";
  children: React.ReactNode;
}) {
  return (
    <section className="animate-fade-up space-y-3" style={{ animationDelay: "100ms" }}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {tone === "brand" && <span className="h-2 w-2 animate-low-pulse rounded-full bg-brand" />}
        {title}
      </h2>
      {children}
    </section>
  );
}
