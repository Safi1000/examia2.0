"use client";

import Link from "next/link";
import type { Student, Submission, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { testById } from "@/lib/data/selectors";
import { topicMastery } from "@/lib/scoring";
import { waTextLink } from "@/lib/landing";
import { displayName } from "@/lib/display-name";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

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
  const tests = released.flatMap((s) => {
    const t = testById(db, s.testId);
    return t ? [t] : [];
  });
  const mastery = topicMastery(tests, released);
  const masteryFor = (subject: string, name: string) =>
    mastery.find((m) => m.subject.toLowerCase() === subject.trim().toLowerCase() && m.name.toLowerCase() === name.toLowerCase());

  // Notes this student can open (same scoping as the Notes page).
  const noteIds = new Set(
    db.noteAssignments
      .filter(
        (na) =>
          na.cohortId === student.cohortId &&
          (!na.classId || student.classIds.includes(na.classId)) &&
          (!na.subjectId || student.subjectIds.includes(na.subjectId)),
      )
      .map((na) => na.noteId),
  );
  const noteFor = (topic: string) =>
    db.notes.find((n) => noteIds.has(n.id) && n.title.toLowerCase().includes(topic.toLowerCase()));

  type Step = { name: string; subject: string; lost?: number; out?: number; redo?: number[]; overall?: number };
  let steps: Step[];

  if (test && submission) {
    const byTopic = new Map<string, Step>();
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
    steps = Array.from(byTopic.values())
      .filter((s) => (s.lost ?? 0) > 0)
      .map((s) => ({ ...s, overall: masteryFor(s.subject, s.name)?.percent }))
      .sort((a, b) => b.lost! - a.lost! || (a.overall ?? 100) - (b.overall ?? 100))
      .slice(0, 3);
  } else {
    steps = mastery
      .filter((m) => m.percent < 70)
      .slice(0, 3)
      .map((m) => ({ name: m.name, subject: m.subject, overall: m.percent }));
  }

  if (!released.length) return null;
  const first = displayName(student.username).split(" ")[0];

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold text-ink">
        {test ? "What to work on next" : "Your next three steps"}
      </h2>
      {steps.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-2">
          {test ? "Full marks on this one. Nothing to fix here." : "No weak topics right now. Keep doing the weekly tests to stay sharp."}
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => {
            const note = noteFor(s.name);
            const pct = s.overall != null ? Math.round(s.overall) : undefined;
            return (
              <li key={`${s.subject}|${s.name}`} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-ink">
                    <span className="mr-2 font-mono text-sm text-ink-3">{i + 1}</span>
                    {s.name}
                  </p>
                  {pct != null && (
                    <span className="shrink-0 text-sm tabular-nums text-ink-2">{pct}% overall</span>
                  )}
                </div>
                {pct != null && (
                  <div className="mt-2 h-1.5 rounded-full bg-surface-2" aria-hidden>
                    <div
                      className={cn("h-full rounded-full", pct < 50 ? "bg-error" : pct < 70 ? "bg-warning" : "bg-success")}
                      style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                    />
                  </div>
                )}
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
                        <a key={n} href={`#q-${n}`} className="rounded-md border border-border-strong px-2.5 py-1.5 font-semibold text-ink hover:border-brand">
                          Q{n}
                        </a>
                      ))}
                    </span>
                  )}
                  {note && (
                    <Link href={`/notes?open=${note.id}`} className="rounded-md border border-border-strong px-3 py-1.5 font-semibold text-ink hover:border-brand">
                      Read: {note.title}
                    </Link>
                  )}
                  <a
                    href={waTextLink(`Hi Hamza, it's ${first}. I'm stuck on ${s.name} (${s.subject})${test ? ` from ${test.title}` : ""}. Can you help me with it?`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md px-3 py-1.5 font-semibold text-brand hover:underline"
                  >
                    Ask about this →
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
