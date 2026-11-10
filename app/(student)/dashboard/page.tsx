"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { attendancePercent, studentById } from "@/lib/data/selectors";
import { dueFor } from "@/lib/due";
import { gradeSubmission } from "@/lib/grading";
import { AnnouncementsPanel } from "@/components/student/AnnouncementsPanel";
import { ClassNow } from "@/components/student/ClassNow";
import { NotifyCard } from "@/components/student/NotifyCard";
import { TopicChip } from "@/components/student/TopicChip";
import { Icon } from "@/components/ui";
import { formatRelative, formatWhen } from "@/lib/time";
import { buildStudyPlan, type PlanWeek } from "@/lib/study-plan";
import { GRADE_FLOOR, performanceSnapshot, sameSubject, shownPercent, type Snapshot } from "@/lib/performance";
import { StudyBuddy, todaysMission } from "@/components/student/StudyBuddy";
import { DailyFive } from "@/components/student/DailyFive";
import { syllabusProgress } from "@/lib/syllabus-progress";
import type { Profile } from "@/lib/profile";
import { displayName } from "@/lib/display-name";
import { isAsStudent } from "@/lib/grading";
import { cn } from "@/lib/cn";
import { DEMO } from "@/lib/demo";
import { FocusOnThis } from "@/components/student/FocusOnThis";
import { IslandHeader } from "@/components/student/IslandHeader";
import { SectionTitle } from "@/components/student/PortalKit";
import { JOIN_EARLY_MIN, pkDate, slotsForStudent, useSchedule } from "@/lib/classes";

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

const PHASE_LABEL: Record<PlanWeek["phase"], string> = {
  learn: "Learn and practise",
  "past-papers": "Past papers",
  final: "Final week",
};

/**
 * Home: what to do now (class, open tests, work due), then where the student
 * stands (performance) and what this week is for (plan). Full lists live on
 * Tests, Homework and Progress, so nothing here repeats them.
 */
export default function DashboardPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  useSchedule(); // re-render when the timetable loads, so the class check below is current
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const due = useMemo(() => (student ? dueFor(db, student, nowMs) : null), [db, student, nowMs]);
  const tests = { open: due?.openTests ?? [], next: due?.nextTest ?? null };

  // Plan, performance and today's mission are the heavy sums on Home: work them
  // out once per data change (or every 5 minutes), not on every tick.
  const hourBucket = Math.floor(nowMs / 300_000);
  const heavy = useMemo(() => {
    if (!student) return { plan: null, perf: null, mission: null, books: [] };
    const at = hourBucket * 300_000;
    return { plan: buildStudyPlan(db, student, at), perf: performanceSnapshot(db, student), mission: todaysMission(db, student, at), books: syllabusProgress(db, student) };
  }, [db, student, hourBucket]);

  if (!student || !heavy.plan) return null;

  const dueSoon = due?.dueSoon ?? [];
  const overdue = due?.overdue ?? [];

  const { plan, perf, mission, books } = heavy;
  // This month's attendance (last month's until the first class is marked) and syllabus covered.
  const ym = new Date(nowMs + 5 * 3_600_000).toISOString().slice(0, 7);
  const prevYm = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const attendance = attendancePercent(db, student.id, `${ym}-01`) ?? attendancePercent(db, student.id, `${prevYm}-01`);
  const chapters = books.reduce((a, b) => ({ covered: a.covered + b.covered, total: a.total + b.total }), { covered: 0, total: 0 });
  const syllabus = chapters.total ? Math.round((chapters.covered / chapters.total) * 100) : null;
  const week = plan.weeks.find((w) => w.isCurrent) ?? null;

  // One line that answers "what do I do now?".
  const first = tests.open[0];
  const status = first
    ? `${tests.open.length === 1 ? "One test" : `${tests.open.length} tests`} to do. ${first.title} closes ${formatRelative(first.closesAt, nowMs)}.`
    : overdue.length
      ? `${overdue.length === 1 ? `${overdue[0].title} is` : `${overdue.length} pieces of homework are`} overdue. Hand ${overdue.length === 1 ? "it" : "them"} in when you can.`
      : dueSoon.length
      ? `${dueSoon[0].title} is due ${formatRelative(dueSoon[0].dueAt, nowMs)}.`
      : tests.next
        ? `Nothing due. Next test opens ${formatWhen(tests.next.opensAt)}.`
        : "You're all caught up.";

  // Results out in the last 3 days sit at the end of the list, quietly.
  const newResults = db.submissions
    .filter((x) => x.studentId === student.id && x.status === "released" && x.releasedAt && nowMs - +new Date(x.releasedAt) < 3 * 86_400_000)
    .sort((a, b) => +new Date(b.releasedAt!) - +new Date(a.releasedAt!))
    .flatMap((x) => {
      const t = db.tests.find((tt) => tt.id === x.testId);
      return t ? [{ key: `r-${x.id}`, href: `/results/${t.id}`, title: t.title, meta: `Result out · ${shownPercent(gradeSubmission(t, x).percent)}%`, cta: "See result", quiet: true }] : [];
    });

  const subjectOf = (id?: string | null) => (id ? db.subjects.find((x) => x.id === id)?.name : undefined);
  type Todo = { key: string; href: string; title: string; meta: string; cta: string; quiet?: boolean; focus?: { kind: "test" | "homework"; subject?: string } };
  const todo: Todo[] = [
    ...tests.open.map((t) => ({ key: t.id, href: `/test/${t.id}`, title: t.title, meta: `Test · closes ${formatRelative(t.closesAt, nowMs)}`, cta: "Start", focus: { kind: "test" as const, subject: t.subject } })),
    // Straight to that homework on the Homework page, not the top of the list.
    ...overdue.map((a) => ({ key: a.id, href: `/assignments#a-${a.id}`, title: a.title, meta: `Homework · overdue since ${formatWhen(a.dueAt)}`, cta: "Hand in", focus: { kind: "homework" as const, subject: subjectOf(a.subjectId) } })),
    ...dueSoon.map((a) => ({ key: a.id, href: `/assignments#a-${a.id}`, title: a.title, meta: `Homework · due ${formatWhen(a.dueAt)}`, cta: "Hand in", focus: { kind: "homework" as const, subject: subjectOf(a.subjectId) } })),
    ...newResults,
  ];
  const toDoCount = todo.filter((x) => !x.quiet).length;
  // A class about to start or running turns the class card gold with its Join
  // button: then that is the one gold action on Home, and everything else stays outlined.
  const classOn = slotsForStudent(db, student, pkDate(nowMs)).some((sl) => nowMs >= sl.startMs - JOIN_EARLY_MIN * 60_000 && nowMs < sl.endMs);
  // Otherwise one gold button on the list: the most urgent item. The rest stay quiet.
  const lead = classOn ? undefined : todo.find((x) => !x.quiet)?.key;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pt-8">
      {/* One entrance for the page: each block rises in, 70ms apart. */}
      <div className="rise space-y-8">
        <HomeHero name={displayName(student.username).split(" ")[0]} status={status} studentId={student.id} totalMinutes={profile.focus?.totalMinutes} />

        <ClassNow db={db} student={student} nowMs={nowMs} />
        <NotifyCard />

        {todo.length > 0 && (
          <section aria-labelledby="todo-title">
            <SectionTitle id="todo-title" live={toDoCount > 0} count={toDoCount}>
              {toDoCount > 0 ? "To do" : "New for you"}
            </SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-xl">
              {todo.map((x) => (
                // The whole row opens the item (a stretched link); "Focus on this" sits on top of it.
                // Phones: the title gets the full width, with the date and buttons on the line under it.
                // Wider screens: title and date on the left, buttons on the right.
                <li
                  key={x.key}
                  className="row-link relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-4 [grid-template-areas:'title_title'_'meta_actions'] sm:gap-y-0.5 sm:px-6 sm:[grid-template-areas:'title_actions'_'meta_actions']"
                >
                  <Link
                    href={x.href}
                    className="line-clamp-2 break-words font-semibold text-ink [grid-area:title] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand"
                  >
                    {x.title}
                    <span className="sr-only">, {x.cta}</span>
                  </Link>
                  <span className="block text-sm text-ink-3 tabular-nums [grid-area:meta]">{x.meta}</span>
                  <span className="flex items-center gap-3 [grid-area:actions]">
                    {x.focus && <FocusOnThis kind={x.focus.kind} title={x.title} subject={x.focus.subject} href={x.href} variant="icon" />}
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-semibold transition-colors",
                        x.key === lead
                          ? "bg-brand text-on-brand shadow-[0_8px_20px_-10px_rgba(251,193,89,0.7)]"
                          : "border border-border-strong text-ink",
                      )}
                    >
                      {x.cta} <Icon.ChevronRight className="h-4 w-4" />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {todo.length === 0 && (
          <div className="surface flex items-center gap-4 rounded-xl px-5 py-4 sm:px-6">
            <p className="text-base text-ink-2">
              <span className="block font-semibold text-ink">Nothing due right now.</span>
              {tests.next ? `Next test opens ${formatWhen(tests.next.opensAt)}.` : "New tests and homework show up here."}
            </p>
          </div>
        )}

        {/* Hamza's notices: high up, but one line each so the day's work stays in view. */}
        <AnnouncementsPanel student={student} />

        {/* Five quick past paper questions from covered chapters, once a day. */}
        <DailyFive books={books} />

        {/* Its Start button stays quiet while something above has the gold one. */}
        <StudyBuddy db={db} student={student} nowMs={nowMs} mission={mission} quiet={toDoCount > 0 || classOn} />

        <div className="grid gap-4 sm:grid-cols-2">
          <PerformanceCard perf={perf} targets={profile.targets} asOnly={isAsStudent(student?.id)} attendance={attendance} syllabus={syllabus} />
          <PlanCard week={week} daysLeft={plan.daysLeft} />
        </div>
      </div>
    </div>
  );
}

/** The part of the day, for the greeting and the header picture. */
function partOfDay(d = new Date()) {
  // Preview only (npm run dev:demo): ?tod=dawn|day|dusk|night shows that picture.
  if (DEMO && typeof window !== "undefined") {
    const t = new URLSearchParams(window.location.search).get("tod");
    if (t === "dawn" || t === "day" || t === "dusk" || t === "night") return t;
  }
  const h = d.getHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

/**
 * The greeting band at the top of Home: the student's own island, which gains a
 * piece for every full focus block (IslandHeader), lit for the time of day.
 */
function HomeHero({ name, status, studentId, totalMinutes }: { name: string; status: string; studentId: string; totalMinutes: number | undefined }) {
  return (
    <IslandHeader studentId={studentId} totalMinutes={totalMinutes} timeOfDay={partOfDay()}>
      <p className="label-quiet text-ink-2">
        {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="mt-2.5 break-words text-[2rem] font-extrabold leading-[1.04] tracking-[-0.03em] text-ink [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] sm:text-[2.5rem] lg:text-[2.75rem]">
        {greeting()}, {name}.
      </h1>
      <p className="mt-3 max-w-[40ch] text-base leading-relaxed text-pretty text-ink-2">{status}</p>
    </IslandHeader>
  );
}

function PerformanceCard({
  perf,
  targets,
  asOnly,
  attendance,
  syllabus,
}: {
  perf: Snapshot | null;
  targets?: Profile["targets"];
  asOnly?: boolean;
  attendance: number | null;
  syllabus: number | null;
}) {
  // Each subject against the student's own target, when they set one.
  const vsTarget = (perf?.bySubject ?? []).flatMap((s) => {
    const key = Object.keys(targets ?? {}).find((k) => sameSubject(k, s.subject));
    const raw = key && typeof targets![key] === "string" && targets![key] in GRADE_FLOOR ? targets![key] : undefined;
    // AS Level has no A*: an old A* target counts as A.
    const target = raw === "A*" && asOnly ? "A" : raw;
    return target ? [{ ...s, target, gap: Math.max(0, Math.ceil(GRADE_FLOOR[target] - s.recent)) }] : [];
  });
  return (
    <Link href="/progress" className="surface surface-link flex flex-col rounded-xl p-5 sm:p-6">
      <p className="text-[17px] font-bold tracking-[-0.01em] text-ink">How you&apos;re doing</p>
      {!perf || perf.marked < 3 ? (
        <p className="mt-3 flex-1 text-[15px] text-ink-2">
          {perf ? `${perf.marked} of 3 tests marked. ` : ""}Your grade shows here after three marked tests.
        </p>
      ) : (
        <div className="mt-3 flex-1">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-extrabold leading-none tracking-[-0.03em] text-brand tabular-nums">{perf.grade}</span>
              <span className="pb-1 text-sm text-ink-2">
                <span className="font-semibold tabular-nums text-ink">{shownPercent(perf.recent)}%</span> avg
                <br />
                <span className="text-xs text-ink-3 tabular-nums">last {Math.min(5, perf.marked)} tests</span>
              </span>
            </div>
            <Sparkline points={perf.points} />
          </div>
          {perf.delta != null && Math.abs(perf.delta) >= 1 && (
            <p className={cn("mt-3 text-sm font-semibold tabular-nums", perf.delta > 0 ? "text-success" : "text-warning")}>
              {perf.delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(perf.delta))}% vs the tests before
            </p>
          )}
          {vsTarget.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {vsTarget.map((s) => (
                <li key={s.subject} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink-2">{s.subject}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-ink">{s.grade}</span>
                    <span className="text-ink-3"> → {s.target}</span>
                    {s.gap > 0 ? <span className="text-warning"> +{s.gap}%</span> : <span className="text-success"> ✓</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {perf.weakest.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              Work on:{" "}
              {perf.weakest.map((w, i) => (
                <span key={w.name}>
                  {i > 0 && ", "}
                  <span className="font-semibold text-ink">{w.name}</span> <span className="text-ink-3">{w.percent}%</span>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
      {(attendance != null || syllabus != null) && (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
          {attendance != null && (
            <div>
              <dt className="text-xs text-ink-3">Attendance</dt>
              <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", attendance >= 90 ? "text-success" : attendance >= 75 ? "text-ink" : "text-warning")}>{Math.round(attendance)}%</dd>
            </div>
          )}
          {syllabus != null && (
            <div>
              <dt className="text-xs text-ink-3">Syllabus covered</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink">{syllabus}%</dd>
            </div>
          )}
        </dl>
      )}
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-ink-2">
        Full progress <Icon.ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function PlanCard({ week, daysLeft }: { week: PlanWeek | null; daysLeft: number }) {
  return (
    <Link href="/plan" className="surface surface-link flex flex-col rounded-xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[17px] font-bold tracking-[-0.01em] text-ink">This week</p>
        <span className="text-sm tabular-nums text-ink-2">
          <span className="font-bold text-ink">{daysLeft}</span> days to exams
        </span>
      </div>
      <div className="mt-3 flex-1">
        <p className="text-[15px] text-ink-2">{week ? PHASE_LABEL[week.phase] : "Your plan"}</p>
        {week && week.topics.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {week.topics.map((t) => (
              <TopicChip key={`${t.subject}|${t.name}`} t={t} />
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[15px] text-ink-2">Revise this week&apos;s class topics from your notes.</p>
        )}
        {week && week.tests.length > 0 && (
          <p className="mt-2.5 text-sm text-ink-3">
            {week.tests.length === 1 ? "1 test" : `${week.tests.length} tests`} this week
          </p>
        )}
      </div>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-ink-2">
        See your full plan <Icon.ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** Last few results as a tiny line (no axes: the shape is the point). */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 36;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 3 - (Math.max(0, Math.min(100, p)) / 100) * (h - 6)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={lx} cy={ly} r="3" fill="var(--color-brand)" />
    </svg>
  );
}
