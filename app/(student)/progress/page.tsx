"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { isVagueTopic, topicMastery } from "@/lib/scoring";
import { GRADE_FLOOR, performanceSnapshot, shownPercent } from "@/lib/performance";
import { formatDate } from "@/lib/time";
import { studentSubjects } from "@/components/student/Welcome";
import { EmptyState, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ShareMoment } from "@/components/student/ShareMoment";
import { displayName } from "@/lib/display-name";
import { worldScene } from "@/lib/groundwork";
import { overallTarget, targetFor as pickedTarget } from "@/components/student/targets";
import { topicNotesFinder } from "@/components/student/topic-notes";
import { syllabusProgress, type BookProgress } from "@/lib/syllabus-progress";
import { AttendanceCard } from "@/components/student/AttendanceCard";
import type { Mission } from "@/components/student/FocusMode";
import { EmptyArt, GradeMedallion, PageHeader, SectionTitle } from "@/components/student/PortalKit";

/** Results shown before "See all": the latest, so subjects and topics stay near the top. */
const RESULTS_SHOWN = 5;

const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });

/**
 * My progress, in the order a student asks: Where am I? How did each test go?
 * Which subject needs me? Which topics? Then their Groundwork study time.
 */
export default function ProgressPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const [practise, setPractise] = useState<Mission | null>(null);
  const [allResults, setAllResults] = useState(false);
  const books = useMemo(() => (student ? syllabusProgress(db, student) : []), [db, student]);
  const notesFor = useMemo(() => (student ? topicNotesFinder(db, student) : null), [db, student]);

  const data = useMemo(() => {
    if (!student) return null;
    const released = submissionsForStudent(db, student.id)
      .filter((s) => s.status === "released")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
    const results = released.flatMap((s) => {
      const t = testById(db, s.testId);
      return t ? [{ test: t, sub: s, pct: gradeSubmission(t, s).percent }] : [];
    });
    const topics = topicMastery(
      results.map((r) => r.test),
      results.map((r) => r.sub),
    ).filter((m) => m.available > 0 && !isVagueTopic(m.name));
    // Tests that are over (or already handed in), so a test still open today isn't "missed".
    const done0 = new Set(submissionsForStudent(db, student.id).filter((s) => s.status !== "in_progress").map((s) => s.testId));
    const mineAll = testsForStudent(db, student);
    const set = mineAll.filter((t) => +new Date(t.closesAt) <= nowMs || done0.has(t.id));
    // Open now and not handed in yet: not missed, but not done either.
    const openNow = mineAll.filter((t) => +new Date(t.opensAt) <= nowMs && +new Date(t.closesAt) > nowMs && !done0.has(t.id)).length;
    return {
      results,
      snap: performanceSnapshot(db, student),
      weak: topics.filter((m) => m.percent < 60).slice(0, 5),
      strong: [...topics].filter((m) => m.percent >= 75).sort((a, b) => b.percent - a.percent).slice(0, 5),
      handed: set.filter((t) => done0.has(t.id)).length,
      setCount: set.length,
      openNow,
    };
  }, [db, student, nowMs]);

  if (!student || !data) return null;
  const { results, snap } = data;
  const targetFor = (subject: string) => pickedTarget(profile.targets, student, subject);
  // One target beside the overall grade, only when every subject's target is the same.
  const overall = snap ? overallTarget(profile.targets, student, snap.bySubject.map((x) => x.subject)) : undefined;

  // Missed ones, and any still open, so "4 / 4" never reads as nothing left to do.
  const missed = data.setCount - data.handed;
  const testsLine = [missed > 0 ? `${missed} missed` : "None missed", data.openNow > 0 ? `${data.openNow} open now` : ""].filter(Boolean).join(" · ");

  const pace = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
      <AttendanceCard db={db} studentId={student.id} nowMs={nowMs} />
      <SyllabusDone books={books} />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="My progress" />

      {!snap && (
        <EmptyState icon={<Icon.Chart />} art={<EmptyArt name="empty-no-tests-yet" />} title="Your grade starts with your first marked test" message="Once I release a result, your grade, subjects and topics show up here." />
      )}

      {/* Showing up and keeping pace: attendance and how much of the syllabus is done. */}
      {!snap && pace}

      {!snap ? null : (
        <>
          {/* 1. Where am I? */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="surface relative overflow-hidden rounded-card p-5 sm:col-span-2 sm:p-6">
              <p className="text-sm font-semibold text-ink-3">{snap.marked >= 3 ? "On track for" : "Your grade"}</p>
              {snap.marked < 3 ? (
                <div className="mt-2">
                  <div className="flex gap-1.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={cn("h-2 w-10 rounded-full", i < snap.marked ? "bg-ink" : "bg-surface-2")} />
                    ))}
                  </div>
                  <p className="mt-3 text-lg font-semibold text-ink">
                    {snap.marked} of 3 tests marked
                  </p>
                  <p className="mt-0.5 text-sm text-ink-3">Your grade shows after three, so one test can&apos;t decide it.</p>
                </div>
              ) : (
              <div className="mt-4 flex items-center gap-5">
                <GradeMedallion grade={snap.grade} size={88} />
                <div>
                  <p className="text-title font-bold leading-none tracking-[-0.025em] tabular-nums text-ink">{shownPercent(snap.recent)}%</p>
                  <p className="mt-1.5 text-sm text-ink-2">average of your last {Math.min(5, snap.marked)} tests</p>
                  {overall && <p className="mt-1 text-sm font-semibold text-ink-2">Target {overall}</p>}
                </div>
              </div>
              )}
              {snap.delta != null && Math.abs(Math.round(snap.delta)) >= 1 && (
                <p className="mt-3 text-sm font-semibold tabular-nums text-ink-2">
                  Last {Math.min(5, snap.marked)} tests: {Math.abs(Math.round(snap.delta))} {Math.abs(Math.round(snap.delta)) === 1 ? "point" : "points"} {snap.delta > 0 ? "higher" : "lower"} than the ones before.
                </p>
              )}
              {(snap.grade === "A*" || snap.grade === "A") && snap.marked >= 3 && (
                <div className="mt-4">
                  <ShareMoment
                    label="Share my grade"
                    moment={{ kicker: "Working at", big: `${snap.grade} grade`, sub: `${shownPercent(snap.recent)}% across my last ${Math.min(5, snap.marked)} tests`, name: displayName(student.username).split(" ")[0], scene: worldScene(profile.world) }}
                  />
                </div>
              )}
            </div>
            <div className="surface flex items-center justify-between gap-4 rounded-card p-5 sm:block sm:p-6">
              <div>
                <p className="text-sm font-semibold text-ink-3">Tests done</p>
                <p className="mt-0.5 text-sm text-ink-3 sm:hidden">{testsLine}</p>
              </div>
              <p className="text-title font-bold tracking-[-0.025em] tabular-nums text-ink sm:mt-2">
                {data.handed}
                <span className="text-lg font-semibold text-ink-3"> / {data.setCount}</span>
              </p>
              <p className="mt-1 hidden text-sm text-ink-3 sm:block">{testsLine}</p>
            </div>
          </section>

          {/* 2. How did each test go? Students come here straight after a result, so it sits under the summary. */}
          <section>
            <SectionTitle count={results.length}>Results</SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
              {(allResults ? results : results.slice(0, RESULTS_SHOWN)).map(({ test, sub, pct }) => (
                <li key={sub.id}>
                  <Link href={`/results/${test.id}`} className="row-link flex items-center gap-4 px-5 py-4 sm:px-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-base font-bold tracking-[-0.02em] text-ink">{gradeSubmission(test, sub).letter}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-base font-semibold text-ink">{test.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-3 tabular-nums">
                        {test.subject}
                        {sub.submittedAt ? ` · ${formatDate(sub.submittedAt)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold text-ink">{shownPercent(pct)}%</span>
                    <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
            {results.length > RESULTS_SHOWN && (
              <button
                type="button"
                onClick={() => setAllResults(!allResults)}
                className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
              >
                {allResults ? "Show fewer" : `See all ${results.length} results`}
              </button>
            )}
          </section>

          {/* 3. Which subject needs me? */}
          <section>
            <SectionTitle>By subject</SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
              {snap.bySubject.map((s) => {
                const target = targetFor(s.subject);
                const gap = target ? Math.max(0, Math.ceil(GRADE_FLOOR[target] - s.recent)) : null;
                return (
                  <li key={s.subject} className="px-5 py-4 sm:px-6">
                    <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-base font-semibold text-ink">{s.subject}</p>
                      <p className="flex shrink-0 items-baseline gap-2">
                        <span className="text-sm tabular-nums text-ink-3">{shownPercent(s.recent)}%</span>
                        <span className="w-9 text-right text-xl font-bold leading-none tracking-[-0.02em] text-ink">{s.grade}</span>
                      </p>
                    </div>
                    <div className="relative mt-3 h-1.5 rounded-full bg-surface-2" aria-hidden>
                      <div className="h-full rounded-full bg-ink-3" style={{ width: `${Math.max(2, Math.min(100, s.recent))}%` }} />
                      {target && <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink" style={{ left: `${GRADE_FLOOR[target]}%` }} />}
                    </div>
                    {target && (
                      <p className={cn("mt-2 text-sm font-semibold", gap ? "text-warning" : "text-success")}>
                        {gap ? `${gap} ${gap === 1 ? "point" : "points"} to your ${target}` : `On track for ${target}`}
                      </p>
                    )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {pace}

          {/* 4. Which topics? */}
          {(data.weak.length > 0 || data.strong.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="surface rounded-card p-5 sm:p-6">
                <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">Fix these next</h2>
                {data.weak.length === 0 ? (
                  <p className="mt-2 text-base text-ink-2">No weak topics right now. Nice.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {data.weak.map((m, i) => {
                      const notes = notesFor?.(m.subject, m.name) ?? null;
                      const meta = (
                        <span className="mt-0.5 block text-sm text-ink-3 tabular-nums">
                          {m.subject} · {Math.round(m.percent)}%{notes ? ` · ${notes.label}` : ""}
                        </span>
                      );
                      return (
                      <li key={m.topic} className="flex items-center justify-between gap-3">
                        {notes ? (
                          // The topic opens its notes; Practise stays beside it.
                          <Link href={notes.href} className="group flex min-h-11 min-w-0 flex-col justify-center">
                            <span className="block truncate text-base font-semibold text-ink underline decoration-hairline-strong underline-offset-4 group-hover:decoration-ink-3">{m.name}</span>
                            {meta}
                          </Link>
                        ) : (
                          <span className="min-w-0">
                            <span className="block truncate text-base font-semibold text-ink">{m.name}</span>
                            {meta}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            // "Open the notes for it" opens that note straight away.
                            setPractise({ subject: m.subject, topic: m.name, noteHref: notes?.exact ? notes.href : undefined });
                          }}
                          className={buttonClasses({ variant: i === 0 ? "primary" : "secondary", size: "sm", className: "shrink-0" })}
                        >
                          Practise
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="surface rounded-card p-5 sm:p-6">
                <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">Your strengths</h2>
                {data.strong.length === 0 ? (
                  <p className="mt-2 text-base text-ink-2">Topics at 75% or more show here.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {data.strong.map((m) => (
                      <li key={m.topic} className="rounded-full border border-border-strong px-3 py-1.5 text-sm tabular-nums">
                        <span className="font-semibold text-ink">{m.name}</span> <span className="text-ink-2">{Math.round(m.percent)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

        </>
      )}

      <Link href="/groundwork" className="surface-quiet surface-link flex items-center justify-between gap-3 rounded-card p-5 text-base text-ink-2 sm:p-6">
        <span>
          Your study time, level and streak are in <span className="font-semibold text-ink">Focus</span>
        </span>
        <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
      </Link>

      </div>
      {practise &&
        createPortal(<FocusMode subjects={studentSubjects(db, student)} mission={practise} onClose={() => setPractise(null)} />, document.body)}
    </div>
  );
}

/** How many chapters of each syllabus the class has covered (a chapter counts once its notes are out). Home shows the same count. */
function SyllabusDone({ books }: { books: BookProgress[] }) {
  if (!books.length) return null;
  return (
    <section className="surface rounded-card p-5 sm:p-6" aria-labelledby="syl-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="syl-h" className="text-lg font-bold tracking-[-0.01em] text-ink">Chapters covered</h2>
        <Link href="/notes" className="-my-3 -mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          Notes
        </Link>
      </div>
      <ul className="mt-4 space-y-4">
        {books.map((b) => {
          const pct = b.total ? Math.round((b.covered / b.total) * 100) : 0;
          return (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-base font-semibold text-ink">{b.label}</span>
                <span className="shrink-0 text-sm tabular-nums text-ink-3">
                  {b.covered} of {b.total} chapters
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-ink-3" style={{ width: `${pct > 0 ? Math.max(2, pct) : 0}%` }} />
              </div>
              {b.latest && <p className="mt-1.5 truncate text-sm text-ink-3">Latest: {b.latest.name}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
