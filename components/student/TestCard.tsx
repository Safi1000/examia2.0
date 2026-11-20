"use client";

import Link from "next/link";
import type { Submission, Test } from "@/types";
import { Badge, Card, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { testWindow, formatRelative, formatWhen } from "@/lib/time";
import { gradeSubmission } from "@/lib/grading";
import { FocusOnThis } from "@/components/student/FocusOnThis";
import { AddToCalendar } from "@/components/student/AddToCalendar";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { waTextLink } from "@/lib/landing";

/**
 * A missed test: one tap opens WhatsApp to Hamza with the ask already written,
 * so a lost test can still be sat (Hamza reopens it for one student). The
 * number is the site's own contact number, the one the landing page uses.
 */
function AskToReopen({ title }: { title: string }) {
  const { session } = useAuth();
  const db = useDatabase();
  const me = session?.studentId ? studentById(db, session.studentId) : null;
  const name = me ? displayName(me.username) : "";
  const text = `Hi Hamza, I missed the test "${title}". Could you reopen it for me?${name ? ` (${name})` : ""}`;
  return (
    <a href={waTextLink(text)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline sm:min-h-0">
      Ask me to reopen it
    </a>
  );
}

export function TestCard({
  test,
  submission,
  nowMs,
  lead = true,
  calendar = false,
}: {
  test: Test;
  submission: Submission | null;
  nowMs: number;
  /** The one gold button on the page; other open tests get a quiet one. */
  lead?: boolean;
  /** A test still to open: offer "Add to calendar" inside the card. */
  calendar?: boolean;
}) {
  const window = testWindow(test.opensAt, test.closesAt, nowMs);
  const released = submission?.status === "released";
  const submitted = submission?.status === "submitted";
  const result = released && submission ? gradeSubmission(test, submission) : null;
  // Under a day left reads as urgent.
  const closingSoon = window === "open" && +new Date(test.closesAt) - nowMs < 24 * 3600 * 1000;

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        {/* The test code is Hamza's own reference: students only need the subject. */}
        <p className="text-sm font-medium text-ink-3">{test.subject}</p>
        <h3 className="mt-1 text-base font-semibold leading-snug text-ink">{test.title}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-2 tabular-nums">
          <span className="inline-flex items-center gap-1"><Icon.Clock className="h-4 w-4" />{test.durationMinutes} min</span>
          {/* Questions stay hidden until a test opens: don't show "0 questions". */}
          {test.questions.length > 0 && <span>{test.questions.length} {test.questions.length === 1 ? "question" : "questions"}</span>}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-col sm:flex-nowrap sm:items-end sm:gap-2">
        {window === "future" && (
          <>
            <Badge tone="neutral"><Icon.Lock className="h-3 w-3" /> Locked</Badge>
            <span className="text-sm text-ink-3">Opens {formatWhen(test.opensAt)}</span>
            {calendar && <AddToCalendar test={test} />}
          </>
        )}

        {window === "open" && !submission && (
          // Under a day left: the same words, just firmer (gold stays for the Start button).
          <span className={closingSoon ? "text-sm font-semibold text-ink tabular-nums" : "text-sm text-ink-2 tabular-nums"}>
            {test.reopened ? "Opened for you, closes" : "Closes"} {formatRelative(test.closesAt, nowMs)}
          </span>
        )}

        {window === "open" && !submission && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* Start test is the one action here; Focus stays as a quiet outline pill beside it. */}
            <FocusOnThis kind="test" title={test.title} subject={test.subject} />
            <Link href={`/test/${test.id}`} className={buttonClasses({ variant: lead ? "primary" : "secondary", className: "flex-1 sm:flex-none" })}>
              Start test
            </Link>
          </div>
        )}

        {/* Waiting for marks reads the same whether the test is still open for others or has closed. */}
        {submitted && (
          <div className="sm:text-right">
            <Badge tone="neutral">Handed in</Badge>
            <p className="mt-1 text-sm text-ink-3">I&apos;ll mark it soon.</p>
          </div>
        )}

        {result && (
          <span className="text-sm tabular-nums text-ink-2">
            <span className="font-bold text-ink">{result.awarded}/{result.total}</span> · <span className="font-semibold text-ink">{result.letter}</span>
          </span>
        )}

        {released && (
          <Link href={`/results/${test.id}`} className={buttonClasses({ variant: "secondary", className: "ml-auto sm:ml-0" })}>
            View result
          </Link>
        )}

        {window === "closed" && !submission && (
          // Left on phones like every other card's status, right beside the title on wider screens.
          <div className="sm:text-right">
            <Badge tone="neutral">Closed</Badge>
            <p className="mt-1 text-sm text-ink-3">Not attempted</p>
            <AskToReopen title={test.title} />
          </div>
        )}
      </div>
    </Card>
  );
}
