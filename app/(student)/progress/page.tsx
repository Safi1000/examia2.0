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
import { topicMastery } from "@/lib/scoring";
import { GRADE_FLOOR, performanceSnapshot, sameSubject, shownPercent } from "@/lib/performance";
import { formatDate } from "@/lib/time";
import { studentSubjects } from "@/components/student/Welcome";
import { EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ShareMoment } from "@/components/student/ShareMoment";
import { displayName } from "@/lib/display-name";
import { worldScene } from "@/lib/groundwork";
import { isAsStudent } from "@/lib/grading";
import { syllabusProgress, type BookProgress } from "@/lib/syllabus-progress";
import { AttendanceCard } from "@/components/student/AttendanceCard";
import type { Mission } from "@/components/student/FocusMode";
import { EmptyArt, GradeMedallion, PageHeader, SectionTitle } from "@/components/student/PortalKit";

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
  const books = useMemo(() => (student ? syllabusProgress(db, student) : []), [db, student]);

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
    ).filter((m) => m.available > 0);
    // Tests that are over (or already handed in), so a test still open today isn't "missed".
    const done0 = new Set(submissionsForStudent(db, student.id).filter((s) => s.status !== "in_progress").map((s) => s.testId));
    const set = testsForStudent(db, student).filter((t) => +new Date(t.closesAt) <= nowMs || done0.has(t.id));
    return {
      results,
      snap: performanceSnapshot(db, student),
      weak: topics.filter((m) => m.percent < 60).slice(0, 5),
      strong: [...topics].filter((m) => m.percent >= 75).sort((a, b) => b.percent - a.percent).slice(0, 5),
      handed: set.filter((t) => done0.has(t.id)).length,
      setCount: set.length,
    };
  }, [db, student, nowMs]);

  if (!student || !data) return null;
  const { results, snap } = data;
  const targetFor = (subject: string) => {
    const key = Object.keys(profile.targets ?? {}).find((k) => sameSubject(k, subject));
    const t = key ? profile.targets![key] : undefined;
    // AS Level has no A*: an old A* target counts as A.
    return typeof t === "string" && t in GRADE_FLOOR ? (t === "A*" && isAsStudent(student?.id) ? "A" : t) : undefined;
  };
  const noteFor = (topic: string) => db.notes.find((n) => n.title.toLowerCase().includes(topic.toLowerCase()));

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
            <div className="relative overflow-hidden rounded-xl border border-brand/25 bg-surface bg-[linear-gradient(135deg,rgba(251,193,89,0.13),rgba(251,193,89,0.02)_65%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_18px_40px_-24px_rgba(251,193,89,0.3)] sm:col-span-2 sm:p-6">
              <p className="text-sm font-semibold text-brand">{snap.marked >= 3 ? "On track for" : "Your grade"}</p>
              {snap.marked < 3 ? (
                <div className="mt-2">
                  <div className="flex gap-1.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={cn("h-2 w-10 rounded-full", i < snap.marked ? "bg-brand" : "bg-surface-2")} />
                    ))}
                  </div>
                  <p className="mt-3 text-lg font-semibold text-ink">
                    {snap.marked} of 3 tests marked
                  </p>
                  <p className="text-sm text-ink-3">Your grade shows after three, so one test can’t decide it.</p>
                </div>
              ) : (
              <div className="mt-3 flex items-end gap-4">
                <GradeMedallion grade={snap.grade} size={96} />
                <div className="pb-1">
                  <p className="text-lg font-semibold tabular-nums text-ink">{shownPercent(snap.recent)}%</p>
                  <p className="text-xs text-ink-3">average of your last {Math.min(5, snap.marked)} tests</p>
                </div>
              </div>
              )}
              {snap.delta != null && Math.abs(snap.delta) >= 1 && (
                <p className={cn("mt-3 text-sm font-semibold tabular-nums", snap.delta > 0 ? "text-success" : "text-warning")}>
                  {snap.delta > 0 ? "▲ Up" : "▼ Down"} {Math.abs(Math.round(snap.delta))}% on the tests before
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
            <div className="surface flex items-center justify-between gap-4 rounded-xl px-5 py-4 sm:block sm:p-6">
              <div>
                <p className="text-sm font-semibold text-ink-3">Tests done</p>
                <p className="mt-0.5 text-xs text-ink-3 sm:hidden">{data.setCount - data.handed > 0 ? `${data.setCount - data.handed} missed` : "None missed"}</p>
              </div>
              <p className="text-3xl font-extrabold tracking-[-0.02em] tabular-nums text-ink sm:mt-2">
                {data.handed}
                <span className="text-lg font-semibold text-ink-3"> / {data.setCount}</span>
              </p>
              <p className="mt-1 hidden text-xs text-ink-3 sm:block">{data.setCount - data.handed > 0 ? `${data.setCount - data.handed} missed` : "None missed"}</p>
            </div>
          </section>

          {/* 2. How did each test go? Students come here straight after a result, so it sits under the summary. */}
          <section>
            <SectionTitle count={results.length}>Results</SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-xl">
              {results.map(({ test, sub, pct }) => (
                <li key={sub.id}>
                  <Link href={`/results/${test.id}`} className="row-link flex items-center gap-4 px-5 py-4 sm:px-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-base font-extrabold tracking-[-0.02em] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">{gradeSubmission(test, sub).letter}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{test.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-3 tabular-nums">
                        {test.subject}
                        {sub.submittedAt ? ` · ${formatDate(sub.submittedAt)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold text-ink">{shownPercent(pct)}%</span>
                    <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* 3. Which subject needs me? */}
          <section>
            <SectionTitle>By subject</SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-xl">
              {snap.bySubject.map((s) => {
                const target = targetFor(s.subject);
                const gap = target ? Math.max(0, Math.ceil(GRADE_FLOOR[target] - s.recent)) : null;
                return (
                  <li key={s.subject} className="px-5 py-5 sm:px-6">
                    <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate font-semibold text-ink">{s.subject}</p>
                      <p className="flex shrink-0 items-baseline gap-2">
                        <span className="text-sm tabular-nums text-ink-3">{shownPercent(s.recent)}%</span>
                        <span className="w-9 text-right text-2xl font-extrabold leading-none tracking-[-0.02em] text-ink">{s.grade}</span>
                      </p>
                    </div>
                    <div className="relative mt-3 h-1.5 rounded-full bg-white/[0.07]" aria-hidden>
                      <div className="h-full rounded-full bg-brand/80" style={{ width: `${Math.max(2, Math.min(100, s.recent))}%` }} />
                      {target && <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink" style={{ left: `${GRADE_FLOOR[target]}%` }} />}
                    </div>
                    {target && (
                      <p className={cn("mt-2 text-xs font-semibold", gap ? "text-warning" : "text-success")}>
                        {gap ? `${gap}% to your ${target}` : `On track for ${target}`}
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
              <div className="surface rounded-xl p-5 sm:p-6">
                <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">Fix these next</h2>
                {data.weak.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-2">No weak topics right now. Nice.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {data.weak.map((m, i) => (
                      <li key={m.topic} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                          <span className="block text-xs text-ink-3 tabular-nums">
                            {m.subject} · {Math.round(m.percent)}%
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            // "Open the notes for it" opens that note straight away.
                            const note = noteFor(m.name);
                            setPractise({ subject: m.subject, topic: m.name, noteHref: note ? `/notes?open=${note.id}` : undefined });
                          }}
                          className={cn(
                            "h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors active:scale-[0.98]",
                            i === 0 ? "bg-brand text-on-brand" : "border border-border-strong text-ink hover:border-brand/60",
                          )}
                        >
                          Practise
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="surface rounded-xl p-5 sm:p-6">
                <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">Your strengths</h2>
                {data.strong.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-2">Topics at 75% or more show here.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {data.strong.map((m) => (
                      <li key={m.topic} className="rounded-full border border-success/20 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success tabular-nums">
                        {m.name} {Math.round(m.percent)}%
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

        </>
      )}

      <Link href="/groundwork" className="surface-quiet surface-link flex items-center justify-between gap-3 rounded-xl px-5 py-4 text-base text-ink-2 sm:px-6">
        <span>
          Your study time, level and streak are in <span className="font-semibold text-ink">Groundwork</span>
        </span>
        <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
      </Link>

      </div>
      {practise &&
        createPortal(<FocusMode subjects={studentSubjects(db, student)} mission={practise} onClose={() => setPractise(null)} />, document.body)}
    </div>
  );
}

/** How much of each syllabus the class has covered, from the notes released so far. */
function SyllabusDone({ books }: { books: BookProgress[] }) {
  if (!books.length) return null;
  return (
    <section className="surface rounded-xl p-5 sm:p-6" aria-labelledby="syl-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="syl-h" className="text-lg font-bold tracking-[-0.01em] text-ink">Syllabus covered</h2>
        <Link href="/notes" className="-my-3 -mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          Notes
        </Link>
      </div>
      <ul className="mt-4 space-y-4">
        {books.map((b) => {
          const pct = b.total ? Math.round((b.covered / b.total) * 100) : 0;
          return (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-ink">{b.label}</span>
                <span className="shrink-0 tabular-nums text-ink-3">
                  {b.covered} of {b.total} chapters
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/[0.07]" aria-hidden>
                <div className="h-full rounded-full bg-brand/80" style={{ width: `${pct > 0 ? Math.max(2, pct) : 0}%` }} />
              </div>
              {b.latest && <p className="mt-1.5 truncate text-xs text-ink-3">Latest: {b.latest.name}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
