/**
 * Pure notification helpers: status, countdowns, relative stamps, categories.
 *
 * Side-effect-free and "now" is always passed in, matching lib/time.ts — the
 * hooks own the clock (see useNow). Nothing about a notification's schedule is
 * ever persisted: a stored "starts in 2 hours" is a lie the moment it is
 * written, so status and countdown are always derived from the test's
 * opensAt/closesAt against the current time.
 */
import type { Activity, ActivityType, Test } from "@/types";

// ---------------------------------------------------------------------------
// Test status
// ---------------------------------------------------------------------------

export type TestNotificationStatus = "upcoming" | "active" | "closing_soon" | "closed";

/** A test counts as "closing soon" once this little of its window remains. */
const CLOSING_SOON_MS = 15 * 60_000;

export function testNotificationStatus(
  opensAt: string,
  closesAt: string,
  nowMs: number,
): TestNotificationStatus {
  const opens = new Date(opensAt).getTime();
  const closes = new Date(closesAt).getTime();
  if (nowMs < opens) return "upcoming";
  if (nowMs >= closes) return "closed";
  return closes - nowMs <= CLOSING_SOON_MS ? "closing_soon" : "active";
}

export const STATUS_LABEL: Record<TestNotificationStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  closing_soon: "Closing Soon",
  closed: "Closed",
};

/**
 * Long-form countdown: "2 hours 15 minutes", "48 minutes", "Less than a minute".
 * Clamped at zero — a countdown must never render a negative value.
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

  if (days > 0) return `${plural(days, "day")} ${plural(hours, "hour")}`;
  if (hours > 0) return `${plural(hours, "hour")} ${plural(minutes, "minute")}`;
  if (minutes > 0) return plural(minutes, "minute");
  return "Less than a minute";
}

/** Duration of a test, e.g. "90 minutes" / "2 hours". */
export function formatTestDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hs = `${h} hour${h === 1 ? "" : "s"}`;
  return m ? `${hs} ${m} minute${m === 1 ? "" : "s"}` : hs;
}

/**
 * The countdown line for a test card: what we are counting to, and how long.
 * Returns null once the test is closed (there is nothing left to count).
 */
export function testCountdown(
  test: Pick<Test, "opensAt" | "closesAt">,
  nowMs: number,
): { label: string; value: string } | null {
  const status = testNotificationStatus(test.opensAt, test.closesAt, nowMs);
  if (status === "closed") return null;
  if (status === "upcoming") {
    return { label: "Starts in", value: formatRemaining(new Date(test.opensAt).getTime() - nowMs) };
  }
  return { label: "Closes in", value: formatRemaining(new Date(test.closesAt).getTime() - nowMs) };
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** "15 July 2026 • 09:00 AM" — the brief wants date and time always together. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} • ${time.toUpperCase()}`;
}

/** "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "12 Mar 2026". */
export function relativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));

  if (secs < 60) return "Just now";
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (secs < 86_400) {
    const h = Math.floor(secs / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }

  // Calendar-day comparison, not "24h ago": something at 23:00 last night is
  // "Yesterday" at 09:00 today even though fewer than 24 hours have passed.
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const daysAgo = Math.ceil((startOfToday.getTime() - then) / 86_400_000);
  if (daysAgo <= 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return new Date(then).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | "all"
  | "unread"
  | "tests"
  | "notes"
  | "results"
  | "announcements"
  | "activities";

/**
 * Which filter tab an entry belongs to. "activities" is the catch-all for
 * things that happened rather than things announced (submissions, enrolment,
 * access logs), so every type lands in exactly one bucket.
 */
export function categoryOf(type: ActivityType): Exclude<NotificationCategory, "all" | "unread"> {
  switch (type) {
    case "test_created":
    case "test_updated":
    case "test_deleted":
      return "tests";
    case "notes_uploaded":
    case "notes_assigned":
    case "notes_deleted":
      return "notes";
    case "result_released":
    case "submission_reviewed":
      return "results";
    case "announcement_posted":
      return "announcements";
    default:
      return "activities";
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Where "Open Test" should actually land, resolved at CLICK time.
 *
 * A test notification is written once and read for weeks, so its destination
 * cannot be baked in: the same "New test" row should open the runner while the
 * test is live, and the result once it has been marked. This deliberately
 * mirrors the rules the dashboard's TestCard already applies, so a notification
 * can never take a student somewhere the dashboard would not:
 *
 *   released result  -> /results/{id}
 *   open, not sat    -> /test/{id}      (the existing runner)
 *   anything else    -> /dashboard      (locked, closed, or awaiting results —
 *                                        there is no separate details page, and
 *                                        the dashboard is where that state shows)
 *
 * A test that no longer exists, or that this session cannot read, falls back to
 * the dashboard rather than pushing a route that would 404.
 */
export function resolveActivityLink(
  activity: Activity,
  ctx: {
    test: Test | null;
    /** This student's submission for that test, if any. */
    submission: { status: string } | null;
    nowMs: number;
  },
): string | undefined {
  // Only student-facing test notifications are re-resolved. Staff links
  // (/admin/tests/{id}, /admin/grading/{id}) and every other type are unchanged.
  if (activity.audience !== "student" || !activity.testId) return activity.link;

  const { test, submission, nowMs } = ctx;
  if (!test) return "/dashboard";                       // deleted, or not visible

  if (submission?.status === "released") return `/results/${test.id}`;

  const status = testNotificationStatus(test.opensAt, test.closesAt, nowMs);
  const live = status === "active" || status === "closing_soon";
  if (live && !submission) return `/test/${test.id}`;   // the existing runner

  return "/dashboard";
}

/** Free-text match across the fields a reader can actually see. */
export function matchesQuery(a: Activity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    a.title.toLowerCase().includes(q) ||
    (a.description?.toLowerCase().includes(q) ?? false)
  );
}
