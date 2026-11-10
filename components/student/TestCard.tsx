"use client";

import Link from "next/link";
import type { Submission, Test } from "@/types";
import { Badge, Card, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { testWindow, formatDate, formatRelative, formatWhen } from "@/lib/time";
import { gradeSubmission } from "@/lib/grading";
import { FocusOnThis } from "@/components/student/FocusOnThis";

export function TestCard({
  test,
  submission,
  nowMs,
  lead = true,
}: {
  test: Test;
  submission: Submission | null;
  nowMs: number;
  /** The one gold button on the page; other open tests get a quiet one. */
  lead?: boolean;
}) {
  const window = testWindow(test.opensAt, test.closesAt, nowMs);
  const released = submission?.status === "released";
  const submitted = submission?.status === "submitted";
  const result = released && submission ? gradeSubmission(test, submission) : null;
  // Under a day left reads as urgent.
  const closingSoon = window === "open" && +new Date(test.closesAt) - nowMs < 24 * 3600 * 1000;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        {/* The test code is Hamza's own reference: students only need the subject. */}
        <p className="text-xs font-medium text-ink-3">{test.subject}</p>
        <h3 className="mt-1 text-lg font-bold leading-snug tracking-[-0.01em] text-ink">{test.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-2 tabular-nums">
          <span className="inline-flex items-center gap-1"><Icon.Clock className="h-3.5 w-3.5" />{test.durationMinutes} min</span>
          {/* Questions stay hidden until a test opens: don't show "0 questions". */}
          {test.questions.length > 0 && <span>{test.questions.length} {test.questions.length === 1 ? "question" : "questions"}</span>}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-col sm:flex-nowrap sm:items-end sm:gap-2">
        {window === "future" && (
          <>
            <Badge tone="neutral"><Icon.Lock className="h-3 w-3" /> Locked</Badge>
            <span className="text-xs text-ink-3">Opens {formatWhen(test.opensAt)}</span>
            {/* Prepare for it in Groundwork before it opens. */}
            <FocusOnThis kind="test" title={test.title} subject={test.subject} />
          </>
        )}

        {window === "open" && !submission && (
          <span className={closingSoon ? "text-sm font-semibold text-warning tabular-nums" : "text-sm text-ink-2 tabular-nums"}>
            {test.reopened ? "Opened for you, closes" : "Closes"} {formatRelative(test.closesAt, nowMs)}
          </span>
        )}

        {window === "open" && !submission && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <FocusOnThis kind="test" title={test.title} subject={test.subject} />
            <Link href={`/test/${test.id}`} className={buttonClasses({ variant: lead ? "primary" : "secondary", className: "flex-1 sm:flex-none" })}>
              Start test
            </Link>
          </div>
        )}

        {window === "open" && submitted && (
          <div className="text-right">
            <Badge tone="neutral">Submitted</Badge>
            <p className="mt-1 text-xs text-ink-3">Awaiting results</p>
          </div>
        )}

        {result && (
          <span className="text-sm tabular-nums text-ink-2">
            <span className="font-bold text-ink">{result.awarded}/{result.total}</span> · <span className="font-semibold text-ink">{result.letter}</span>
          </span>
        )}

        {released && (
          <Link href={`/results/${test.id}`} className={buttonClasses({ variant: "secondary", className: "w-full sm:w-auto" })}>
            View result
          </Link>
        )}

        {window === "closed" && submitted && (
          <div className="text-right">
            <Badge tone="warning">Awaiting results</Badge>
            <p className="mt-1 text-xs text-ink-3">Closed {formatDate(test.closesAt)}</p>
          </div>
        )}

        {window === "closed" && !submission && (
          <div className="text-right">
            <Badge tone="neutral">Closed</Badge>
            <p className="mt-1 text-xs text-ink-3">Not attempted</p>
          </div>
        )}
      </div>
    </Card>
  );
}
