"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { isVagueTopic, topicMastery } from "@/lib/scoring";
import { GRADE_FLOOR, performanceSnapshot, shownPercent } from "@/lib/performance";
import { formatDate } from "@/lib/time";
import { EmptyState, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ShareMoment } from "@/components/student/ShareMoment";
import { displayName } from "@/lib/display-name";
import { worldScene } from "@/lib/groundwork";
import { overallTarget, targetFor as pickedTarget } from "@/components/student/targets";
import { topicNotesFinder } from "@/components/student/topic-notes";
import { paperCodeFor, syllabusProgress, topicalFor, type BookProgress } from "@/lib/syllabus-progress";
import { shelvesFor } from "@/lib/note-shelves";
import { matchChapter, subjectOfName } from "@/lib/notes-library";
import { useTopicalIndex } from "@/components/student/SyllabusCard";
import { AttendanceCard } from "@/components/student/AttendanceCard";
import { EmptyArt, GradeMedallion, PageHeader, ProgressRing, SectionTitle } from "@/components/student/PortalKit";

/** Results shown before "See all": the latest, so subjects and topics stay near the top. */
const RESULTS_SHOWN = 5;

/**
 * Progress, five sections in the order a student asks: Where am I (and the one
 * gold "Practise" for the weakest topic)? How did each test go? Which subject
 * needs me? Am I showing up? How much of the syllabus is covered?
 */
export default function ProgressPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const [allResults, setAllResults] = useState(false);
  const books = useMemo(() => (student ? syllabusProgress(db, student) : []), [db, student]);
  const notesFor = useMemo(() => (student ? topicNotesFinder(db, student) : null), [db, student]);
  const shelves = useMemo(() => (student ? shelvesFor(db, student) : []), [db, student]);
  const topicalIndex = useTopicalIndex();

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

  // Missed ones, and any still open, so "4 of 4" never reads as nothing left to do.
  const missed = data.setCount - data.handed;
  const testsLine = [
    `${data.handed} of ${data.setCount} tests done`,
    missed > 0 ? `${missed} missed` : "",
    data.openNow > 0 ? `${data.openNow} open now` : "",
  ].filter(Boolean).join(", ");

  // The one gold action: practise the weakest topic. The rest stay quiet links.
  const [lead, ...otherWeak] = data.weak;
  // Where "Practise" goes: that topic's past paper questions; when it has none,
  // its notes; when there are no notes either, the Study list.
  const practiseLink = (m: (typeof data.weak)[number]): { href: string; label: string } => {
    const subj = subjectOfName(m.subject);
    for (const s of shelves) {
      if (!s.book || !subj || s.book.subject !== subj) continue;
      const ch = matchChapter(s.book, m.name);
      const t = ch && !ch.unit ? topicalFor(topicalIndex, paperCodeFor(s.book), ch.num) : null;
      if (t) return { href: t.href, label: `Practise ${m.name}` };
    }
    const notes = notesFor?.(m.subject, m.name) ?? null;
    if (notes) return { href: notes.href, label: `Read the notes on ${m.name}` };
    return { href: "/study", label: "Open your study list" };
  };
  const leadLink = lead ? practiseLink(lead) : null;
  const lastN = snap ? Math.min(5, snap.marked) : 0;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="Progress" />

      {!snap && (
        <EmptyState icon={<Icon.Chart />} art={<EmptyArt name="empty-no-tests-yet" />} title="Your grade starts with your first marked test" message="Once I release a result, your grade, subjects and topics show up here." />
      )}

      {snap && (
        <>
          {/* 1. Where am I, and the one thing to do next. */}
          <section aria-labelledby="grade-h" className="surface rounded-card p-5 sm:p-6">
            <p id="grade-h" className="text-sm font-semibold text-ink-3">{snap.marked >= 3 ? "On track for" : "Your grade"}</p>
            {snap.marked < 3 ? (
              <div className="mt-4 flex items-center gap-5">
                <ProgressRing done={snap.marked} total={3} size={88} stroke={4} label={`${snap.marked}/3`} />
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{snap.marked} of 3 tests marked</p>
                  <p className="mt-0.5 text-sm text-ink-3">Your grade shows after three, so one test can&apos;t decide it.</p>
                  <p className="mt-1 text-sm text-ink-2 tabular-nums">{testsLine}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-5">
                <GradeMedallion grade={snap.grade} size={88} />
                <div className="min-w-0">
                  <p className="text-title font-bold leading-none tracking-[-0.025em] tabular-nums text-ink">{shownPercent(snap.recent)}%</p>
                  <p className="mt-1.5 text-sm text-ink-2">average of your last {lastN} tests</p>
                  <p className="mt-0.5 text-sm text-ink-2 tabular-nums">{testsLine}</p>
                  {overall && <p className="mt-0.5 text-sm font-semibold text-ink-2">Target {overall}</p>}
                </div>
              </div>
            )}
            {snap.delta != null && Math.abs(Math.round(snap.delta)) >= 1 && (
              <p className="mt-3 text-sm font-semibold tabular-nums text-ink-2">
                Last {lastN} tests: {Math.abs(Math.round(snap.delta))} {Math.abs(Math.round(snap.delta)) === 1 ? "point" : "points"} {snap.delta > 0 ? "higher" : "lower"} than the ones before.
              </p>
            )}
            {(snap.grade === "A*" || snap.grade === "A") && snap.marked >= 3 && (
              <div className="mt-4">
                <ShareMoment
                  label="Share my grade"
                  moment={{ kicker: "Working at", big: `${snap.grade} grade`, sub: `${shownPercent(snap.recent)}% across my last ${lastN} tests`, name: displayName(student.username).split(" ")[0], scene: worldScene(profile.world) }}
                />
              </div>
            )}
            {lead && leadLink && (
              <div className="mt-5 border-t border-hairline pt-5">
                <p className="text-sm text-ink-2 tabular-nums">
                  Your weakest topic is <span className="font-semibold text-ink">{lead.name}</span> in {lead.subject}, at {Math.round(lead.percent)}%.
                </p>
                <Link href={leadLink.href} className={buttonClasses({ size: "lg", fullWidth: true, className: "mt-3 sm:w-auto" })}>
                  {leadLink.label}
                </Link>
                {otherWeak.length > 0 && (
                  <p className="mt-3 text-sm text-ink-3">
                    Also worth practising:{" "}
                    {otherWeak.map((m, i) => (
                      <span key={m.topic}>
                        <Link
                          href={practiseLink(m).href}
                          className="inline-flex min-h-11 items-center font-semibold text-ink-2 underline decoration-hairline-strong underline-offset-4 hover:text-ink hover:decoration-ink-3"
                        >
                          {m.name}
                        </Link>
                        {i < otherWeak.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}
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

          {/* 3. Which subject needs me? A ring for each, never a bar. */}
          <section>
            <SectionTitle>Subjects</SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
              {snap.bySubject.map((s) => {
                const target = targetFor(s.subject);
                const gap = target ? Math.max(0, Math.ceil(GRADE_FLOOR[target] - s.recent)) : null;
                return (
                  <li key={s.subject} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                    {/* Never rounds up: 79.6% draws as 79 of 100. */}
                    <ProgressRing done={Math.floor(s.recent)} total={100} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink">{s.subject}</span>
                      {target && (
                        <span className={cn("mt-0.5 block text-sm", gap ? "text-ink-2" : "font-semibold text-success")}>
                          {gap ? `${gap} ${gap === 1 ? "point" : "points"} to your ${target}` : `On track for ${target}`}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="text-sm tabular-nums text-ink-3">{shownPercent(s.recent)}%</span>
                      <span className="w-9 text-right text-xl font-bold leading-none tracking-[-0.02em] text-ink">{s.grade}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {data.strong.length > 0 && (
              <p className="mt-3 text-sm text-ink-2">
                <span className="font-semibold text-ink">Strong:</span> {data.strong.map((m) => m.name).join(", ")}
              </p>
            )}
          </section>
        </>
      )}

      {/* 4. Showing up. */}
      <AttendanceCard db={db} studentId={student.id} nowMs={nowMs} />

      {/* 5. How much of each syllabus the class has covered. */}
      <TopicTracker books={books} />

      </div>
    </div>
  );
}

/** How many chapters of each syllabus the class has covered (a chapter counts once its notes are out). Home shows the same count. */
function TopicTracker({ books }: { books: BookProgress[] }) {
  if (!books.length) return null;
  return (
    <section aria-labelledby="topics-h">
      <SectionTitle id="topics-h">Topic tracker</SectionTitle>
      <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
        {books.map((b) => (
          <li key={b.key}>
            <Link href={`/notes?shelf=${encodeURIComponent(b.key)}`} className="row-link flex items-center gap-4 px-5 py-4 sm:px-6">
              <ProgressRing done={b.covered} total={b.total} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-ink">{b.label}</span>
                <span className="mt-0.5 block text-sm tabular-nums text-ink-2">
                  {b.covered} of {b.total} chapters
                </span>
                {b.latest && <span className="mt-0.5 block truncate text-sm text-ink-3">Latest: {b.latest.name}</span>}
              </span>
              <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
