"use client";

import { useDatabase } from "@/lib/data/store";
import { cohortById, studentById, submissionById, testById } from "@/lib/data/selectors";
import { useNow } from "@/hooks/useNow";
import { Badge, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  STATUS_LABEL,
  formatDateTime,
  formatTestDuration,
  relativeTime,
  testCountdown,
  testNotificationStatus,
  type TestNotificationStatus,
} from "@/lib/notifications";
import type { Activity, ActivityType } from "@/types";

/** One icon per activity family, reusing the existing Icon set. */
export function ActivityIcon({ type, className }: { type: ActivityType; className?: string }) {
  const cls = className ?? "h-4 w-4";
  switch (type) {
    case "test_updated":
      return <Icon.Edit className={cls} />;
    case "test_started":
    case "test_submitted":
    case "test_completed":
    case "test_created":
    case "test_deleted":
      return <Icon.Doc className={cls} />;
    case "result_released":
    case "submission_reviewed":
      return <Icon.Check className={cls} />;
    case "announcement_posted":
      return <Icon.Megaphone className={cls} />;
    case "notes_uploaded":
    case "notes_assigned":
    case "notes_accessed":
    case "notes_downloaded":
    case "notes_deleted":
      return <Icon.Doc className={cls} />;
    case "student_joined_class":
    case "student_left_class":
      return <Icon.Users className={cls} />;
    default:
      return <Icon.Bell className={cls} />;
  }
}

const STATUS_TONE: Record<TestNotificationStatus, "info" | "success" | "warning" | "neutral"> = {
  upcoming: "info",
  active: "success",
  closing_soon: "warning",
  closed: "neutral",
};

/** Label above a value. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** Date on one line, time under it — the schedule is the thing being scanned. */
function WhenField({ label, iso }: { label: string; iso: string }) {
  const d = new Date(iso);
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="mt-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <span className="block text-xs font-semibold text-ink-2 tabular">
          {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase()}
        </span>
      </dd>
    </div>
  );
}

/**
 * The rich test panel: schedule, status and countdown.
 *
 * Everything here is derived from the test row against the current time rather
 * than read off the notification, so a card written days ago still shows the
 * right status and an accurate countdown. Re-renders on the useNow tick.
 */
function TestDetails({ testId, updatedAt }: { testId: string; updatedAt?: string }) {
  const db = useDatabase();
  const now = useNow();
  const test = testById(db, testId);

  // The test may have been deleted, or be outside what RLS lets this session
  // read — the notification still stands on its title alone.
  if (!test) return null;

  const status = testNotificationStatus(test.opensAt, test.closesAt, now);
  const countdown = testCountdown(test, now);
  const cohort = cohortById(db, test.cohortId);

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-border bg-surface-2/40">
      {/* Header: the test name always shows, whatever the notification is titled. */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/60 px-3.5 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
          <span aria-hidden>{updatedAt ? "✏️" : "📝"}</span>
          <span className="truncate">{test.title}</span>
        </p>
        <Badge tone={STATUS_TONE[status]} className="shrink-0">
          {STATUS_LABEL[status]}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-3.5 py-3">
        <Field label="Subject" value={test.subject} />
        <Field label="Cohort" value={cohort?.name ?? "All cohorts"} />
        <WhenField label="Starts" iso={test.opensAt} />
        <WhenField label="Closes" iso={test.closesAt} />
        <Field label="Duration" value={formatTestDuration(test.durationMinutes)} />
        {countdown ? (
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
              {countdown.label}
            </dt>
            <dd
              className={cn(
                "mt-1 truncate text-sm font-bold tabular",
                status === "closing_soon" ? "text-warning" : "text-brand",
              )}
            >
              {countdown.value}
            </dd>
          </div>
        ) : (
          <WhenField label="Closed on" iso={test.closesAt} />
        )}
        {/* Only on an edit notification: when the change was actually saved. */}
        {updatedAt && <WhenField label="Updated on" iso={updatedAt} />}
      </dl>

      {updatedAt && (
        <p className="border-t border-border px-3.5 py-2 text-xs text-ink-2">
          Changes have been made to this test. Please review the updated details.
        </p>
      )}

      <div className="flex items-center justify-end border-t border-border px-3.5 py-2.5">
        <span className="flex items-center gap-1 text-xs font-bold text-brand">
          {/* The row itself is the click target, so this is a cue, not a button
              nested inside another button. */}
          {status === "closed" ? "View Details" : "Open Test"}
          <Icon.ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

/**
 * The submission panel, shown to staff when a student hands a test in.
 *
 * Read from the cache by submissionId rather than baked into the notification,
 * for the same reason the test panel is: the grading status moves after the row
 * is written, and a card that says "Submitted" when the result is already out
 * would be worse than no card.
 */
function SubmissionDetails({ submissionId }: { submissionId: string }) {
  const db = useDatabase();
  const submission = submissionById(db, submissionId);

  // Deleted, or outside what RLS lets this session read: the title still stands.
  if (!submission) return null;

  const student = studentById(db, submission.studentId);
  const test = testById(db, submission.testId);
  const cohort = cohortById(db, student?.cohortId ?? null);

  const status =
    submission.status === "released"
      ? { label: "Result released", tone: "info" as const }
      : submission.autoSubmitted
        ? { label: "Auto-submitted (time up)", tone: "warning" as const }
        : { label: "Submitted successfully", tone: "success" as const };

  // submittedAt is only absent while a paper is still in progress.
  const at = submission.submittedAt;

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-border bg-surface-2/40">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/60 px-3.5 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
          <span aria-hidden>📝</span>
          <span className="truncate">{test?.title ?? "Test submitted"}</span>
        </p>
        <Badge tone={status.tone} className="shrink-0">{status.label}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-3.5 py-3">
        <Field label="Student" value={student?.username ?? "Unknown student"} />
        <Field label="Cohort" value={cohort?.name ?? "—"} />
        <Field label="Subject" value={test?.subject ?? "—"} />
        <Field label="Test" value={test?.title ?? "—"} />
        {student?.email && <Field label="Email" value={student.email} />}
        {at ? <WhenField label="Submitted" iso={at} /> : <Field label="Submitted" value="In progress" />}
      </dl>

      <div className="flex items-center justify-end border-t border-border px-3.5 py-2.5">
        <span className="flex items-center gap-1 text-xs font-bold text-brand">
          View Submission
          <Icon.ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

/**
 * A single notification. The bell renders the "compact" variant; /notifications
 * renders "full", which additionally unfolds the rich test panel.
 *
 * Always a <button>: clicking marks as read, which is an action in its own
 * right even for an entry that navigates nowhere. It is only inert — and so
 * disabled, rather than announced as a control that does nothing — once it is
 * both read and unlinked.
 */
export function NotificationItem({
  activity,
  unread,
  variant = "compact",
  onSelect,
  onClear,
}: {
  activity: Activity;
  unread: boolean;
  variant?: "compact" | "full";
  onSelect: (a: Activity) => void;
  /** Omit to hide the delete affordance entirely. */
  onClear?: (id: string) => void;
}) {
  const now = useNow();
  const full = variant === "full";

  // A hand-in carries BOTH a testId and a submissionId. It gets the submission
  // panel, not the schedule panel — the reader is staff about to grade it, and
  // the paper's opening time is not what they need. Every other test
  // notification keeps the schedule panel exactly as before.
  const isSubmission =
    !!activity.submissionId &&
    (activity.type === "test_submitted" || activity.type === "test_completed");
  const isTest = !isSubmission && !!activity.testId;

  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-md",
          full ? "h-9 w-9" : "h-7 w-7",
          unread ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-3",
        )}
        aria-hidden
      >
        <ActivityIcon type={activity.type} className={full ? "h-[18px] w-[18px]" : "h-4 w-4"} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-bold text-ink" : "font-semibold text-ink-2",
            )}
          >
            {activity.title}
          </span>
          {unread && (
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          )}
        </span>

        {activity.description && (
          <span
            className={cn(
              "mt-0.5 block text-xs text-ink-3",
              full ? "whitespace-pre-wrap break-words" : "truncate",
            )}
          >
            {activity.description}
          </span>
        )}

        {isTest && (
          <TestDetails
            testId={activity.testId!}
            updatedAt={activity.type === "test_updated" ? activity.createdAt : undefined}
          />
        )}
        {isSubmission && <SubmissionDetails submissionId={activity.submissionId!} />}

        {/* Relative stamp, with the exact time on hover as the brief asks. */}
        <span
          className="mt-1 block text-[11px] text-ink-3 tabular"
          title={formatDateTime(activity.createdAt)}
        >
          {relativeTime(activity.createdAt, now)}
        </span>
      </span>
    </>
  );

  const inert = !activity.link && !unread;

  // The row and the delete control are siblings, not nested: a <button> inside
  // a <button> is invalid, and clicking delete must never also open the link.
  return (
    <div
      className={cn(
        "group relative flex items-start border-b border-border transition-colors last:border-b-0",
        unread && "bg-brand-soft/30",
        !inert && "hover:bg-surface-2",
      )}
    >
      <button
        type="button"
        disabled={inert}
        onClick={() => onSelect(activity)}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 pl-4 text-left",
          onClear ? "pr-1" : "pr-4",
          full ? "py-4" : "py-3",
        )}
      >
        {body}
      </button>

      {onClear && (
        <button
          type="button"
          onClick={() => onClear(activity.id)}
          aria-label={`Delete notification: ${activity.title}`}
          title="Delete notification"
          className={cn(
            "mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3",
            "hover:bg-error-soft hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2",
            full ? "mt-3.5" : "mt-2.5",
            // Always visible on touch, where there is no hover to reveal it.
            "sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
          )}
        >
          <Icon.Trash className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
