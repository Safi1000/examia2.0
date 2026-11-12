"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Student, Test } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { cohortById, eligibleStudents, testById, archivedCohortIds, isArchivedTest, isAwaitingMarking } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { isTestAccount } from "@/lib/display-name";
import { parentTestClosing, studentTestClosing } from "@/lib/portal-messages";
import { useStudentProfiles } from "@/lib/student-profiles";
import { useActivity } from "@/lib/activity-admin";
import { isInPersonStudent } from "@/lib/in-person";
import { buildAttention, recordingReport } from "@/lib/attention";
import { AttentionList } from "@/components/admin/AttentionList";
import { StartCard } from "@/components/admin/StartCard";
import { SlippingCard } from "@/components/admin/SlippingCard";
import { WellBuiltCard } from "@/components/admin/WellBuiltCard";
import { HealthLine } from "@/components/admin/Automations";
import { NotifyCoverage } from "@/components/admin/NotifyCoverage";
import { RemindersPanel } from "@/components/admin/RemindersPanel";
import { addDays, clock, LEVEL_LABEL, liveSlotsOn, pkDate, slotKey, useClassLinks, useSchedule } from "@/lib/classes";
import { formatRelative } from "@/lib/time";
import { createRetest, reachOf, retestQuestions, retestTarget, weakTopics } from "@/lib/retest";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { countPill, panelLink, panelTitle } from "@/components/admin/surface";
import { PortalArt } from "@/components/student/PortalArt";

const DAY = 86_400_000;
const nameOf = (s: Student) => s.username.charAt(0).toUpperCase() + s.username.slice(1);
const waTo = (e164: string | undefined, text: string) =>
  e164 ? `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/**
 * Admin home: everything that needs Hamza today on one screen, each with the
 * one action that deals with it. Read-only except "Make a retest", which goes
 * through the existing store actions. Respects the sidebar cohort filter.
 */
export default function TodayPage() {
  const db = useDatabase();
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();
  const nowMs = useNow();
  const profiles = useStudentProfiles(); // Groundwork cards, recordings opened, the list below
  const profilesReady = Object.keys(profiles).length > 0;
  const todayPk = pkDate(nowMs);
  const { links: classLinks } = useClassLinks(todayPk, todayPk);
  // The last week's recordings and joins, for "missed a class and hasn't opened the recording" (no polling: once, and when the tab comes back).
  const weekAgo = addDays(todayPk, -7);
  const { links: weekLinks, joins: weekJoins, ready: weekReady } = useClassLinks(weekAgo, todayPk, true, false);
  // Last time on the portal, for "not on the portal for 7 days".
  const activity = useActivity(addDays(todayPk, -14), db);
  useSchedule(); // re-render when the timetable loads or changes
  const heroClass = liveSlotsOn(db, todayPk).find((s) => nowMs < s.endMs && s.startMs - nowMs < 3 * 3_600_000);
  // Before the start card shows: when (and which level) the next class is, up to a week ahead.
  const nextClass = heroClass
    ? undefined
    : Array.from({ length: 8 }, (_, i) => liveSlotsOn(db, addDays(todayPk, i)))
        .flat()
        .find((s) => s.startMs > nowMs);
  const nextLabel = nextClass
    ? `${LEVEL_LABEL[nextClass.level]}, ${
        nextClass.date === todayPk
          ? "today"
          : nextClass.date === addDays(todayPk, 1)
            ? "tomorrow"
            : new Date(`${nextClass.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Karachi" })
      } at ${clock(nextClass.start)}`
    : null;
  // "Checked" is saved with the reminder log, so it holds on the laptop and
  // the tablet alike (older ticks made on this device still count).
  const [localChecked] = useState<Record<string, number>>(() => {
    try {
      return typeof window === "undefined" ? {} : (JSON.parse(localStorage.getItem("ht_checked") ?? "{}") as Record<string, number>);
    } catch {
      return {};
    }
  });
  const checked = useMemo(() => {
    const m: Record<string, number> = { ...localChecked };
    for (const r of db.remindersSent) if (r.kind === "checked") m[r.studentId] = Math.max(m[r.studentId] ?? 0, +new Date(r.sentAt));
    return m;
  }, [db.remindersSent, localChecked]);
  // Tests whose full "not handed in" list has been opened (a big class would bury the page otherwise).
  const [allMissing, setAllMissing] = useState<string[]>([]);
  const markChecked = (id: string) => store.markReminderSent(id, "checked", todayPk);

  // The heavy sums below follow the clock in 5-minute steps, not every 30 s tick.
  const tick = Math.floor(nowMs / 300_000) * 300_000;
  const data = useMemo(() => {
    // Switched-off cohorts are archived: they never show up on Today. Nor does
    // Hamza's own test account (its papers still open from Submissions).
    const off = archivedCohortIds(db);
    const inScope = (s: Student) => !off.has(s.cohortId) && !isTestAccount(s) && (cohortId === null || s.cohortId === cohortId);
    const testInScope = (t: Test) =>
      !isArchivedTest(db, t, off) && (cohortId === null || t.cohortId === null || t.cohortId === cohortId);
    const students = db.students.filter(inScope);
    const studentIds = new Set(students.map((s) => s.id));
    const live = db.tests.filter((t) => t.status !== "draft" && testInScope(t));

    // The same rule as the Submissions page, so the two counts agree.
    const toMark = db.submissions
      .filter((s) => studentIds.has(s.studentId) && isAwaitingMarking(db, s, off))
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

    // Homework hand-ins still waiting for a reply, oldest first.
    const toReply = db.assignmentSubmissions
      .filter((x) => !x.feedback && studentIds.has(x.studentId))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    const handedIn = (t: Test) =>
      new Set(db.submissions.filter((s) => s.testId === t.id && s.status !== "in_progress").map((s) => s.studentId));

    const closing = live
      .filter((t) => +new Date(t.opensAt) <= tick && +new Date(t.closesAt) > tick && +new Date(t.closesAt) - tick < 2 * DAY)
      .sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt))
      .map((t) => {
        const done = handedIn(t);
        const eligible = eligibleStudents(db, t).filter(inScope);
        return { test: t, eligible, missing: eligible.filter((s) => !done.has(s.id)) };
      });

    // Students who need Hamza today (lib/attention.ts has every rule and threshold).
    // Hamza's rules (2026-11-09) still hold: grade targets never put a student here.
    const recordings = recordingReport(db, {
      links: weekLinks,
      joins: weekJoins,
      profiles,
      // In-person students have no online register, so recordings don't judge them.
      students: students.filter((s) => !isInPersonStudent(db, s)),
      from: weekAgo,
      to: todayPk,
      nowMs: tick,
    });
    const { problems, rotation } = buildAttention(db, {
      students,
      tests: live,
      nowMs: tick,
      checked,
      profiles,
      profilesReady,
      activity: activity.data,
      recordings: weekReady ? recordings : [],
    });
    const hasResults = db.submissions.some((x) => x.status === "released" && studentIds.has(x.studentId));

    const monthAgo = tick - 30 * DAY;
    const recentPcts = db.submissions
      .filter((x) => x.status === "released" && studentIds.has(x.studentId) && +new Date(x.submittedAt ?? 0) >= monthAgo)
      .flatMap((x) => {
        const t = testById(db, x.testId);
        return t ? [gradeSubmission(t, x).percent] : [];
      });
    const avg30 = recentPcts.length ? Math.round(recentPcts.reduce((a, b) => a + b, 0) / recentPcts.length) : null;

    const weak = weakTopics(db, cohortId).map((w) => ({ ...w, available: retestQuestions(db, w.subject, w.name).length }));

    return { toMark, toReply, closing, problems, rotation, avg30, weak, studentCount: students.length, hasResults };
  }, [db, cohortId, tick, checked, profiles, profilesReady, weekLinks, weekJoins, weekReady, weekAgo, todayPk, activity.data]);

  const cohortName = cohortId ? cohortById(db, cohortId)?.name : null;

  function makeRetest(subject: string, topic: string) {
    const id = createRetest(store, db, { cohortId, subject, topic });
    if (!id) {
      toast("No questions on that topic yet. Add some to the question bank first.", "error");
      return;
    }
    const reach = reachOf(db, { cohortId, ...retestTarget(db, subject, topic) });
    toast(`Retest drafted for ${reach === 1 ? "1 student" : `${reach} students`}. Check it, then press Publish.`, "success");
    router.push(`/admin/tests/${id}`);
  }

  const stats = [
    { label: "To mark", value: data.toMark.length + data.toReply.length, href: "#to-mark" },
    { label: "Closing in 48 hours", value: data.closing.length, href: "#closing" },
    { label: "Students to check on", value: data.problems.length, href: "#attention" },
    { label: "Average, last 30 days", value: data.avg30 === null ? "None yet" : `${data.avg30}%`, href: "/admin/analytics" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        title={`${greeting(new Date(nowMs))}, Hamza`}
        subtitle={`${new Date(nowMs).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Karachi" })}${cohortName ? ` · ${cohortName}` : " · All cohorts"}`}
        actions={
          data.toMark[0] ? (
            <Link href={`/admin/grading/${data.toMark[0].id}`} className={buttonClasses()}>
              Start marking ({data.toMark.length})
            </Link>
          ) : undefined
        }
      />

      {/* Only shows when something needs you: Google, the timer, a missing link or recording. */}
      <HealthLine />

      <NotifyCoverage />

      {/* Parents to message: a skipped test, 2+ absences in a row, a result under 70%, monthly reports. Hidden when there's nothing. */}
      <RemindersPanel />

      {/* The class to start, from 3 hours before until it ends. */}
      {heroClass && <StartCard slot={heroClass} url={classLinks.find((l) => slotKey(l) === slotKey(heroClass))?.meetUrl ?? null} nowMs={nowMs} />}
      {nextLabel && (
        <Link href="/admin/classes" className={cn(panelLink, "mb-4 flex min-h-14 items-center justify-between gap-3 px-5 py-3 text-[15px] text-ink-2")}>
          <span>
            Next class: <span className="font-semibold text-ink">{nextLabel}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-ink-3">Classes <Icon.ChevronRight className="h-3.5 w-3.5" aria-hidden /></span>
        </Link>
      )}

      {/* At a glance */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <a key={s.label} href={s.href} className={cn(panelLink, "px-5 py-4")}>
            <p className="text-[13px] text-ink-3">{s.label}</p>
            <p className="mt-1 text-[1.75rem] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-ink">{s.value}</p>
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* To mark */}
        <Card id="to-mark" className="scroll-mt-24 p-5">
          <h2 className={panelTitle}>To mark</h2>
          {data.toMark.length === 0 ? (
            <div className="mt-3 flex items-center gap-4">
              <PortalArt group="scenes" name="empty-nothing-to-mark" width={72} height={72} sized className="-my-1 shrink-0" imgClassName="object-contain" />
              <p className="text-[15px] text-ink-2">{data.toReply.length ? "No test papers waiting." : "All marked. Nothing waiting."}</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.toMark.slice(0, 6).map((sub) => {
                const st = db.students.find((x) => x.id === sub.studentId);
                const t = testById(db, sub.testId);
                // Past 48 hours, the wait itself shows in amber so old papers stand out.
                const waited = sub.submittedAt ? nowMs - +new Date(sub.submittedAt) : 0;
                const days = waited > 2 * DAY ? Math.floor(waited / DAY) : 0;
                return (
                  <li key={sub.id}>
                    <Link href={`/admin/grading/${sub.id}`} className="group -mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.025]">
                      <span className="min-w-0">
                        <span className="font-semibold text-ink">{st ? nameOf(st) : "Student"}</span>
                        <span className="block truncate text-sm text-ink-2">{t?.title}</span>
                      </span>
                      <span className="shrink-0 text-right text-sm tabular-nums text-ink-3">
                        {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" }) : ""}
                        {days > 0 && <span className="block text-xs font-semibold text-warning">Waiting {days} days</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {data.toMark.length > 6 && (
            <Link href="/admin/submissions" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
              See all {data.toMark.length} <Icon.ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          {data.toReply.length > 0 && (
            <>
              <h3 className="mt-5 border-t border-border pt-4 text-[13px] font-semibold text-ink-3">Homework to reply to</h3>
              <ul className="mt-1 divide-y divide-border">
                {Object.entries(
                  data.toReply.reduce<Record<string, number>>((m, x) => ((m[x.assignmentId] = (m[x.assignmentId] ?? 0) + 1), m), {}),
                )
                  .slice(0, 4)
                  .map(([aid, n]) => (
                    <li key={aid}>
                      <Link href={`/admin/assignments?open=${aid}`} className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.025]">
                        <span className="min-w-0 truncate font-semibold text-ink">{db.assignments.find((a) => a.id === aid)?.title ?? "Homework"}</span>
                        <span className={countPill}>{n} to reply</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Card>

        {/* Closing soon */}
        <Card id="closing" className="scroll-mt-24 p-5">
          <h2 className={panelTitle}>Closing in the next 48 hours</h2>
          {data.closing.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink-2">No tests closing soon.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {data.closing.map(({ test, eligible, missing }) => (
                <li key={test.id} className="py-3 first:pt-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/admin/tests/${test.id}`} className="inline-flex min-h-11 items-center font-semibold text-ink underline-offset-4 hover:underline">{test.title}</Link>
                    <span className="shrink-0 text-sm text-warning">Closes {formatRelative(test.closesAt, nowMs)}</span>
                  </div>
                  <p className="text-sm tabular-nums text-ink-2">
                    {eligible.length - missing.length} of {eligible.length} handed in
                  </p>
                  {missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(allMissing.includes(test.id) ? missing : missing.slice(0, 12)).map((s) => {
                        // To the student if we have their number, else to the parent (worded for them).
                        const link = s.phone
                          ? waTo(s.phone, studentTestClosing({ id: s.id, username: s.username, title: test.title, when: formatRelative(test.closesAt, nowMs) }))
                          : waTo(s.whatsapp, parentTestClosing({ id: s.id, username: s.username, title: test.title, when: formatRelative(test.closesAt, nowMs) }));
                        return link ? (
                          <a key={s.id} href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full border border-border-strong px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-3 hover:bg-surface-2 max-md:min-h-11">
                            Remind {nameOf(s)}
                          </a>
                        ) : (
                          <span key={s.id} className="inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3 text-sm text-ink-3" title="No number saved">
                            {nameOf(s)}
                          </span>
                        );
                      })}
                      {missing.length > 12 && !allMissing.includes(test.id) && (
                        <button
                          type="button"
                          onClick={() => setAllMissing((v) => [...v, test.id])}
                          className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:text-ink max-md:min-h-11"
                        >
                          Show {missing.length - 12} more
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Students who need you today: problems first, then the check-in rotation. */}
        <AttentionList
          problems={data.problems}
          rotation={data.rotation}
          studentCount={data.studentCount}
          nowMs={nowMs}
          loadingMore={!profilesReady || weekReady === null || (activity.data === null && !activity.error)}
          onCheck={markChecked}
        />

        {/* Weak topics → retest */}
        <Card className="p-5 lg:col-span-2">
          <h2 className={panelTitle}>Weakest topics</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-ink-3">From released results{cohortName ? ` in ${cohortName}` : ""}. A retest is drafted from your question bank and past tests, and stays hidden until you publish it.</p>
          {data.weak.length === 0 ? (
            <p className="mt-3 text-[15px] text-ink-2">{data.hasResults ? "No topic is under 70%. Nice." : "No results released yet."}</p>
          ) : (
            <ul className="mt-4 grid divide-y divide-border border-t border-border md:grid-cols-3 md:divide-x md:divide-y-0">
              {data.weak.map((w) => (
                <li key={`${w.subject}|${w.name}`} className="flex flex-col py-4 md:px-5 md:first:pl-0 md:last:pr-0">
                  <p className="text-[13px] text-ink-3">{w.subject}</p>
                  <p className="font-semibold text-ink">{w.name}</p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className={cn("h-full rounded-full", w.percent < 50 ? "bg-error" : "bg-warning")} style={{ width: `${Math.max(4, Math.round(w.percent))}%` }} />
                  </div>
                  <p className="mb-4 mt-1.5 text-sm tabular-nums text-ink-2">{Math.round(w.percent)}% of marks</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-auto self-start"
                    disabled={w.available === 0}
                    onClick={() => makeRetest(w.subject, w.name)}
                  >
                    <Icon.Refresh className="h-4 w-4" />
                    {w.available === 0 ? "No questions yet" : `Make a retest (${w.available} Q)`}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <WellBuiltCard db={db} profiles={profiles} nowMs={nowMs} cohortId={cohortId} />
      <SlippingCard db={db} profiles={profiles} nowMs={nowMs} cohortId={cohortId} />
    </div>
  );
}
