"use client";

import Link from "next/link";
import type { Student, Submission, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { liveStatus, submissionFor, testById, testsForStudent } from "@/lib/data/selectors";
import { topicMastery } from "@/lib/scoring";
import { waTextLink } from "@/lib/landing";
import { displayName } from "@/lib/display-name";
import { Card } from "@/components/ui";
import { topicNotesFinder } from "@/components/student/topic-notes";
import { ProgressRing } from "@/components/student/PortalKit";

/** One step the coach suggests: a topic, the marks lost on it, the questions to redo. */
export type CoachStep = { name: string; subject: string; lost?: number; out?: number; redo?: number[]; overall?: number };

/**
 * The coach's steps, best first. On a result (`test` and `submission` given)
 * the topics where marks were dropped in that test; else the weakest topics
 * overall. Shared with the result page's next step, so both name the same topic.
 */
export function coachSteps(db: Database, student: Student, test?: Test, submission?: Submission): CoachStep[] {
  const released = db.submissions.filter((s) => s.studentId === student.id && s.status === "released");
  const tests = released.flatMap((s) => {
    const t = testById(db, s.testId);
    return t ? [t] : [];
  });
  const mastery = topicMastery(tests, released);
  const masteryFor = (subject: string, name: string) =>
    mastery.find((m) => m.subject.toLowerCase() === subject.trim().toLowerCase() && m.name.toLowerCase() === name.toLowerCase());

  if (test && submission) {
    const byTopic = new Map<string, CoachStep>();
    test.questions.forEach((q, i) => {
      const got = submission.answers.find((a) => a.questionId === q.id)?.marksAwarded ?? 0;
      const name = q.topic.trim() || "General";
      const s = byTopic.get(name) ?? { name, subject: test.subject, lost: 0, out: 0, redo: [] };
      s.out! += q.marks;
      if (got < q.marks) {
        s.lost! += q.marks - got;
        s.redo!.push(i + 1);
      }
      byTopic.set(name, s);
    });
    return Array.from(byTopic.values())
      .filter((s) => (s.lost ?? 0) > 0)
      .map((s) => ({ ...s, overall: masteryFor(s.subject, s.name)?.percent }))
      .sort((a, b) => b.lost! - a.lost! || (a.overall ?? 100) - (b.overall ?? 100))
      .slice(0, 3);
  }
  return mastery
    .filter((m) => m.percent < 70)
    .slice(0, 3)
    .map((m) => ({ name: m.name, subject: m.subject, overall: m.percent }));
}

/** One open test this student still has to do, soonest closing first. */
export function nextOpenTest(db: Database, student: Student, currentId: string) {
  const now = Date.now();
  return testsForStudent(db, student)
    .filter((t) => t.id !== currentId && liveStatus(t, now) === "active" && +new Date(t.opensAt) <= now && (submissionFor(db, student.id, t.id)?.status ?? "in_progress") === "in_progress")
    .sort((a, b) => a.closesAt.localeCompare(b.closesAt))[0] ?? null;
}

/**
 * "What to work on next": turns marks into the next three concrete steps.
 *
 * On a result page (`test` given) it ranks the topics where marks were dropped
 * in that test; on the progress page it ranks the weakest topics overall. Each
 * step links to the questions to redo, a matching note, and a pre-typed
 * WhatsApp question to the teacher.
 */
export function StudyCoach({
  db,
  student,
  test,
  submission,
}: {
  db: Database;
  student: Student;
  test?: Test;
  submission?: Submission;
}) {
  const released = db.submissions.filter((s) => s.studentId === student.id && s.status === "released");
  const steps = coachSteps(db, student, test, submission);

  // The note for a topic, found the same way the Notes page shelves them
  // (else that subject's notes, else nothing).
  const notesFor = topicNotesFinder(db, student);

  if (!released.length) return null;
  const first = displayName(student.username).split(" ")[0];

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-xl font-bold tracking-[-0.015em] text-ink">
        {test ? "What to work on next" : "Your next three steps"}
      </h2>
      {steps.length === 0 ? (
        <p className="mt-2 text-base text-pretty text-ink-2">
          {test ? "Full marks on this one. Nothing to fix here." : "No weak topics right now. Keep doing the weekly tests to stay sharp."}
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => {
            const notes = notesFor(s.subject, s.name);
            const pct = s.overall != null ? Math.round(s.overall) : undefined;
            return (
              <li key={`${s.subject}|${s.name}`} className="border-t border-hairline pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink">
                    <span className="mr-2 text-sm font-bold text-ink-3 tabular-nums">{i + 1}</span>
                    {s.name}
                  </p>
                  {pct != null && (
                    // A ring, never a bar: how this topic has gone across every released test.
                    <span className="inline-flex shrink-0 items-center gap-2 text-sm tabular-nums text-ink-2">
                      <ProgressRing done={Math.max(0, Math.min(100, pct))} total={100} size={32} />
                      {pct}% across your tests
                    </span>
                  )}
                </div>
                {s.lost != null && (
                  <p className="mt-2 text-sm text-ink-2">
                    You dropped {s.lost} of {s.out} marks on this topic in this test.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {s.redo && s.redo.length > 0 && (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="text-ink-2">Redo</span>
                      {s.redo.map((n) => (
                        <a key={n} href={`#q-${n}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border-strong px-3 font-semibold tabular-nums text-ink transition-colors duration-150 hover:border-ink-3 hover:bg-surface-2">
                          Q{n}
                        </a>
                      ))}
                    </span>
                  )}
                  {notes && (
                    <Link href={notes.href} className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 font-semibold text-ink transition-colors duration-150 hover:border-ink-3 hover:bg-surface-2">
                      {notes.label}
                    </Link>
                  )}
                  <a
                    href={waTextLink(`Hi Hamza, it's ${first}. I'm stuck on ${s.name} (${s.subject})${test ? ` from ${test.title}` : ""}. Can you help me with it?`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 font-semibold text-ink transition-colors duration-150 hover:border-ink-3 hover:bg-surface-2"
                  >
                    Ask me on WhatsApp
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
