"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Student, Test } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { absenceStreak, cohortById, eligibleStudents, testById } from "@/lib/data/selectors";
import { gradeSubmission } from "@/lib/grading";
import { formatRelative } from "@/lib/time";
import { createRetest, retestQuestions, weakTopics } from "@/lib/retest";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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

  const data = useMemo(() => {
    const inScope = (s: Student) => cohortId === null || s.cohortId === cohortId;
    const testInScope = (t: Test) => cohortId === null || t.cohortId === null || t.cohortId === cohortId;
    const students = db.students.filter(inScope);
    const studentIds = new Set(students.map((s) => s.id));
    const live = db.tests.filter((t) => t.status !== "draft" && testInScope(t));

    const toMark = db.submissions
      .filter((s) => s.status === "submitted" && studentIds.has(s.studentId))
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));

    const handedIn = (t: Test) =>
      new Set(db.submissions.filter((s) => s.testId === t.id && s.status !== "in_progress").map((s) => s.studentId));

    const closing = live
      .filter((t) => +new Date(t.opensAt) <= nowMs && +new Date(t.closesAt) > nowMs && +new Date(t.closesAt) - nowMs < 2 * DAY)
      .sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt))
      .map((t) => {
        const done = handedIn(t);
        const eligible = eligibleStudents(db, t).filter(inScope);
        return { test: t, eligible, missing: eligible.filter((s) => !done.has(s.id)) };
      });

    // Per-student reasons to get in touch.
    const recentClosed = live.filter(
      (t) => +new Date(t.closesAt) <= nowMs && nowMs - +new Date(t.closesAt) < 14 * DAY,
    );
    const attention = students
      .map((s) => {
        const missed = recentClosed.filter(
          (t) => eligibleStudents(db, t).some((e) => e.id === s.id) && !handedIn(t).has(s.id),
        );
        const released = db.submissions
          .filter((x) => x.studentId === s.id && x.status === "released")
          .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
          .slice(0, 2)
          .flatMap((x) => {
            const t = testById(db, x.testId);
            return t ? [gradeSubmission(t, x).percent] : [];
          });
        const lowAvg =
          released.length === 2 ? Math.round((released[0] + released[1]) / 2) : null;
        const absent = absenceStreak(db, s.id);
        const reasons: string[] = [];
        if (missed.length) reasons.push(`Missed ${missed.map((t) => t.title).join(", ")}`);
        if (lowAvg !== null && lowAvg < 50) reasons.push(`Last two tests averaged ${lowAvg}%`);
        if (absent >= 2) reasons.push(`Absent ${absent} classes in a row`);
        return { student: s, reasons, missed, lowAvg, absent };
      })
      .filter((r) => r.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length);

    const monthAgo = nowMs - 30 * DAY;
    const recentPcts = db.submissions
      .filter((x) => x.status === "released" && studentIds.has(x.studentId) && +new Date(x.submittedAt ?? 0) >= monthAgo)
      .flatMap((x) => {
        const t = testById(db, x.testId);
        return t ? [gradeSubmission(t, x).percent] : [];
      });
    const avg30 = recentPcts.length ? Math.round(recentPcts.reduce((a, b) => a + b, 0) / recentPcts.length) : null;

    const weak = weakTopics(db, cohortId).map((w) => ({ ...w, available: retestQuestions(db, w.subject, w.name).length }));

    return { toMark, closing, attention, avg30, weak };
  }, [db, cohortId, nowMs]);

  const cohortName = cohortId ? cohortById(db, cohortId)?.name : null;

  function makeRetest(subject: string, topic: string) {
    const id = createRetest(store, db, { cohortId, subject, topic });
    if (!id) {
      toast("No questions on that topic yet. Add some to the question bank first.", "error");
      return;
    }
    toast("Retest drafted. Check it, then press Publish.", "success");
    router.push(`/admin/tests/${id}`);
  }

  const stats = [
    { label: "To mark", value: data.toMark.length, href: "#to-mark" },
    { label: "Closing in 48 hours", value: data.closing.length, href: "#closing" },
    { label: "Students to check on", value: data.attention.length, href: "#attention" },
    { label: "Average, last 30 days", value: data.avg30 === null ? "–" : `${data.avg30}%`, href: "/admin/analytics" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title={`${greeting(new Date(nowMs))}, Hamza`}
        subtitle={`${new Date(nowMs).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${cohortName ? ` · ${cohortName}` : " · All cohorts"}`}
        actions={
          data.toMark[0] ? (
            <Link href={`/admin/grading/${data.toMark[0].id}`} className={buttonClasses()}>
              Start marking ({data.toMark.length})
            </Link>
          ) : undefined
        }
      />

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <a key={s.label} href={s.href} className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
            <p className="text-sm text-ink-2">{s.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ink">{s.value}</p>
          </a>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* To mark */}
        <Card id="to-mark" className="scroll-mt-24 p-5">
          <h2 className="text-base font-semibold text-ink">To mark</h2>
          {data.toMark.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink-2">All marked. Nothing waiting.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.toMark.slice(0, 6).map((sub) => {
                const st = db.students.find((x) => x.id === sub.studentId);
                const t = testById(db, sub.testId);
                return (
                  <li key={sub.id}>
                    <Link href={`/admin/grading/${sub.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2.5 hover:text-brand">
                      <span className="min-w-0">
                        <span className="font-semibold text-ink">{st ? nameOf(st) : "Student"}</span>
                        <span className="block truncate text-sm text-ink-2">{t?.title}</span>
                      </span>
                      <span className="shrink-0 text-sm text-ink-3">
                        {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {data.toMark.length > 6 && (
            <Link href="/admin/submissions" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
              See all {data.toMark.length} →
            </Link>
          )}
        </Card>

        {/* Closing soon */}
        <Card id="closing" className="scroll-mt-24 p-5">
          <h2 className="text-base font-semibold text-ink">Closing in the next 48 hours</h2>
          {data.closing.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink-2">No tests closing soon.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {data.closing.map(({ test, eligible, missing }) => (
                <li key={test.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/admin/tests/${test.id}`} className="font-semibold text-ink hover:text-brand">{test.title}</Link>
                    <span className="shrink-0 text-sm text-warning">Closes {formatRelative(test.closesAt, nowMs)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {eligible.length - missing.length} of {eligible.length} handed in
                  </p>
                  {missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {missing.map((s) => {
                        const link = waTo(s.phone ?? s.whatsapp, `Hi ${nameOf(s)}, a reminder that ${test.title} closes ${formatRelative(test.closesAt, nowMs)}. Don't miss it!`);
                        return link ? (
                          <a key={s.id} href={link} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border-strong px-3 py-1.5 text-sm font-semibold text-ink hover:border-brand">
                            Remind {nameOf(s)}
                          </a>
                        ) : (
                          <span key={s.id} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm text-ink-2" title="No number saved">
                            {nameOf(s)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Needs attention */}
        <Card id="attention" className="scroll-mt-24 p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-ink">Students to check on</h2>
          {data.attention.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink-2">Everyone is on track.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.attention.map(({ student: s, reasons, missed, lowAvg }) => {
                const msg = missed.length
                  ? `Hi ${nameOf(s)}, I noticed you missed ${missed[0].title}. Is everything okay? Let me know if you need help catching up.`
                  : lowAvg !== null && lowAvg < 50
                    ? `Hi ${nameOf(s)}, your last two tests were tough. Let's fix it together. When can we do a quick call?`
                    : `Hi ${nameOf(s)}, I noticed you've missed a few classes. Is everything okay?`;
                const studentLink = waTo(s.phone, msg);
                const parentLink = waTo(s.whatsapp, `Assalam o Alaikum, a quick update about ${nameOf(s)}: ${reasons.join(". ")}. Happy to talk whenever suits you.`);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/admin/roster/${s.id}`} className="font-semibold text-ink hover:text-brand">{nameOf(s)}</Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {reasons.map((r) => (
                          <Badge key={r} tone={r.startsWith("Missed") ? "warning" : "error"}>{r}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {studentLink && (
                        <a href={studentLink} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                          Message student
                        </a>
                      )}
                      {parentLink && (
                        <a href={parentLink} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                          Message parent
                        </a>
                      )}
                      {!studentLink && !parentLink && (
                        <Link href={`/admin/roster/${s.id}`} className="text-sm text-ink-3 hover:text-ink">Add a number →</Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Weak topics → retest */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-ink">Weakest topics</h2>
          <p className="mt-1 text-sm text-ink-2">From released results{cohortName ? ` in ${cohortName}` : ""}. A retest is drafted from your question bank and past tests, and stays hidden until you publish it.</p>
          {data.weak.length === 0 ? (
            <p className="mt-3 text-[15px] text-ink-2">No topic is under 70%. Nice.</p>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-3">
              {data.weak.map((w) => (
                <li key={`${w.subject}|${w.name}`} className="flex flex-col rounded-md border border-border bg-surface-2 p-4">
                  <p className="text-sm text-ink-3">{w.subject}</p>
                  <p className="font-semibold text-ink">{w.name}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-paper" aria-hidden>
                    <div className={cn("h-full rounded-full", w.percent < 50 ? "bg-error" : "bg-warning")} style={{ width: `${Math.max(4, Math.round(w.percent))}%` }} />
                  </div>
                  <p className="mt-1.5 text-sm tabular-nums text-ink-2">{Math.round(w.percent)}% of marks</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-4"
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
    </div>
  );
}
