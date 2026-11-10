"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, testById, submissionFor, submissionsForStudent, testsForStudent, liveStatus } from "@/lib/data/selectors";
import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { Card, Badge, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatDuration, formatTimestamp } from "@/lib/time";

export default function SubmittedPage() {
  const params = useParams();
  const id = String(params.id);
  const { session } = useAuth();
  const db = useDatabase();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const submission = student && test ? submissionFor(db, student.id, test.id) : null;

  if (!student || !test || !submission) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-ink-2">
        Nothing to show here.{" "}
        <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold text-brand underline">Back to Home</Link>
      </div>
    );
  }

  const days = usualTurnaround(db, student.id);
  const next = nextOpenTest(db, student, test.id);

  const answered = submission.answers.filter((a) =>
    a.type === "mcq" ? typeof a.selectedIndex === "number" : a.type === "text" ? !!a.text?.trim() : !!a.photoDataUrl,
  ).length;

  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-12">
      <div className="rise">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/25 bg-success-soft text-success shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_30px_-14px_rgba(111,187,168,0.45)]">
          <Icon.Check className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-[2rem] font-extrabold leading-none tracking-[-0.03em] text-ink">Done.</h1>
        <p className="mt-2.5 text-base text-ink-2">
          {submission.autoSubmitted ? "Time ran out, so I handed it in for you." : "Your answers are saved. Sit tight."}
        </p>
      </div>

      <Card className="mt-8 divide-y divide-hairline">
{/* After a reload the answers stay hidden until results are out: only show a real count. */}
        {submission.answers.length > 0 && (
        <Row label="Questions answered">
          <span className="font-semibold text-ink tabular-nums">{answered} / {test.questions.length}</span>
        </Row>
        )}
        <Row label="Submitted at">
          <span className="text-right text-ink tabular-nums">{submission.submittedAt ? formatTimestamp(submission.submittedAt) : "Not yet"}</span>
        </Row>
        {/* Unknown (an older paper): leave the row out rather than say "0s". */}
        {!!submission.durationSeconds && submission.durationSeconds > 0 && (
          <Row label="Time taken">
            <span className="text-ink tabular-nums">{formatDuration(submission.durationSeconds)}</span>
          </Row>
        )}
        <Row label="Submission">
          {submission.autoSubmitted ? (
            <Badge tone="warning">Handed in at time up</Badge>
          ) : (
            <Badge tone="success">Submitted</Badge>
          )}
        </Row>
      </Card>

      <p className="mt-6 text-center text-base text-ink-2">
        I&apos;ll mark this and release your result soon.
        {days != null && (
          <span className="mt-1 block font-semibold text-ink">
            Results usually within {days} {days === 1 ? "day" : "days"}.
          </span>
        )}
      </p>

      {next ? (
        <Link href={`/test/${next.id}`} className={buttonClasses({ fullWidth: true, className: "mt-4" })}>
          Next: {next.title}
        </Link>
      ) : (
        <Link href="/notes" className={buttonClasses({ fullWidth: true, className: "mt-4" })}>
          Revise in Notes while you wait
        </Link>
      )}
      <Link href="/dashboard" className={buttonClasses({ variant: "ghost", fullWidth: true, className: "mt-2" })}>
        Back to Home
      </Link>
      </div>
    </div>
  );
}

/**
 * How long results usually take, from this student's own last released
 * results (hand in to release). Needs at least three to say anything, so
 * the line is never a guess.
 */
function usualTurnaround(db: Database, studentId: string): number | null {
  const waits = submissionsForStudent(db, studentId)
    .filter((s) => s.status === "released" && s.submittedAt && s.releasedAt)
    .sort((a, b) => (b.releasedAt ?? "").localeCompare(a.releasedAt ?? ""))
    .slice(0, 10)
    .map((s) => +new Date(s.releasedAt!) - +new Date(s.submittedAt!))
    .filter((ms) => ms >= 0);
  if (waits.length < 3) return null;
  const avg = waits.reduce((a, b) => a + b, 0) / waits.length;
  return Math.max(1, Math.ceil(avg / 86_400_000));
}

/** One open test this student still has to do, soonest closing first. */
function nextOpenTest(db: Database, student: Student, currentId: string) {
  const now = Date.now();
  return testsForStudent(db, student)
    .filter((t) => t.id !== currentId && liveStatus(t, now) === "active" && +new Date(t.opensAt) <= now && (submissionFor(db, student.id, t.id)?.status ?? "in_progress") === "in_progress")
    .sort((a, b) => a.closesAt.localeCompare(b.closesAt))[0] ?? null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 text-[15px]">
      <span className="text-ink-2">{label}</span>
      {children}
    </div>
  );
}
