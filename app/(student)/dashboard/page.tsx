"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { joinedMs, studentById } from "@/lib/data/selectors";
import { headlineAttendance } from "@/components/student/AttendanceCard";
import { dueFor } from "@/lib/due";
import { gradeSubmission } from "@/lib/grading";
import { AnnouncementsPanel } from "@/components/student/AnnouncementsPanel";
import { ClassNow } from "@/components/student/ClassNow";
import { NotifyCard } from "@/components/student/NotifyCard";
import { TopicChip } from "@/components/student/TopicChip";
import { Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatRelative, formatWhen } from "@/lib/time";
import { buildStudyPlan, type PlanWeek, type StudyPlan } from "@/lib/study-plan";
import { examDateLabel, nextExam, paperName } from "@/lib/exam-dates";
import { performanceSnapshot, shownPercent, type Snapshot } from "@/lib/performance";
import { StudyBuddy, todaysMission } from "@/components/student/StudyBuddy";
import { DailyFive } from "@/components/student/DailyFive";
import { syllabusProgress } from "@/lib/syllabus-progress";
import { displayName } from "@/lib/display-name";
import { cn } from "@/lib/cn";
import { DEMO } from "@/lib/demo";
import { FocusOnThis } from "@/components/student/FocusOnThis";
import { IslandHeader } from "@/components/student/IslandHeader";
import { overallTarget } from "@/components/student/targets";
import { SectionTitle } from "@/components/student/PortalKit";
import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import { JOIN_EARLY_MIN, RECORDING_HOURS, addDays, clockHere, pkDate, slotKey, slotsForStudent, useClassLinks, useSchedule, type DaySlot } from "@/lib/classes";

/** In Pakistan time, like every other time on Home. After midnight it is not morning yet. */
function greeting(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(d));
  if (h < 4) return "Hello";
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
  // The last few days' class links and this student's own joins (they can only read their own),
  // for a class recording still open from a class they weren't in. Read once, not polled.
  const todayPk = pkDate(nowMs);
  const { links: recLinks, joins: myJoins } = useClassLinks(addDays(todayPk, -3), todayPk, true, false);

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
  // This month's attendance (last month's until three classes are marked), the same figure Progress shows, and syllabus covered.
  const att = headlineAttendance(db, student.id, nowMs);
  const attendance = att.percent != null && att.monthName ? { percent: att.percent, month: att.monthName } : null;
  // Chapters covered across their subjects: the same count Progress shows per subject.
  const chapters = books.reduce((a, b) => ({ covered: a.covered + b.covered, total: a.total + b.total }), { covered: 0, total: 0 });
  const syllabus = chapters.total ? chapters : null;
  // Their target beside the grade, when every subject has the same one.
  const target = perf ? overallTarget(profile.targets, student, perf.bySubject.map((x) => x.subject)) : undefined;
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

  // Class recordings still open (2 days after class) from a class they didn't join and haven't
  // opened: one row each, with Watch opening the player on Classes straight away.
  const watched = new Set(profile.watched ?? []);
  const joinedKeys = new Set(myJoins.filter((j) => j.studentId === student.id).map((j) => slotKey(j)));
  const presentDays = new Set(db.attendanceDays.filter((a) => a.studentId === student.id && a.status !== "absent").map((a) => `${a.classId ?? ""}|${a.date}`));
  const recLink = new Map(recLinks.filter((l) => l.recordingUrl).map((l) => [slotKey(l), l]));
  const recordingTodo = Array.from({ length: 4 }, (_, i) => addDays(todayPk, -i))
    .flatMap((d) => slotsForStudent(db, student, d))
    .filter((sl) => {
      const key = slotKey(sl);
      const closes = sl.endMs + RECORDING_HOURS * 3_600_000;
      return (
        sl.endMs <= nowMs &&
        closes > nowMs &&
        sl.startMs >= joinedMs(student) &&
        recLink.has(key) &&
        !watched.has(key) &&
        !joinedKeys.has(key) &&
        !presentDays.has(`${sl.classId}|${sl.date}`) &&
        !presentDays.has(`|${sl.date}`)
      );
    })
    .sort((a, b) => a.endMs - b.endMs)
    .map((sl) => {
      const closes = sl.endMs + RECORDING_HOURS * 3_600_000;
      return {
        key: `rec-${slotKey(sl)}`,
        href: `/classes?watch=${encodeURIComponent(slotKey(sl))}`,
        title: `${sl.subject} class recording`,
        meta: `Class on ${new Date(sl.startMs).toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Karachi" })} · open until ${new Date(closes).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}`,
        cta: "Watch",
      };
    });

  const subjectOf = (id?: string | null) => (id ? db.subjects.find((x) => x.id === id)?.name : undefined);
  type Todo = { key: string; href: string; title: string; meta: string; cta: string; /** A shorter word for phones, where the row is tight. */ ctaShort?: string; quiet?: boolean; focus?: { kind: "test" | "homework"; subject?: string; id: string } };
  const todo: Todo[] = [
    ...tests.open.map((t) => ({ key: t.id, href: `/test/${t.id}`, title: t.title, meta: `Test · closes ${formatRelative(t.closesAt, nowMs)}`, cta: "Start", focus: { kind: "test" as const, subject: t.subject, id: t.id } })),
    // Straight to that homework on the Homework page, not the top of the list.
    ...overdue.map((a) => ({ key: a.id, href: `/assignments#a-${a.id}`, title: a.title, meta: `Homework · overdue since ${formatWhen(a.dueAt)}`, cta: "Hand in work", ctaShort: "Hand in", focus: { kind: "homework" as const, subject: subjectOf(a.subjectId), id: a.id } })),
    // Homework due in the next 3 days counts as to do, the same rule as the Homework tab's number; later homework stays on the list, quietly.
    ...dueSoon.map((a) => ({ key: a.id, href: `/assignments#a-${a.id}`, title: a.title, meta: `Homework · due ${formatRelative(a.dueAt, nowMs)}`, cta: "Hand in work", ctaShort: "Hand in", quiet: +new Date(a.dueAt) - nowMs >= 3 * 86_400_000, focus: { kind: "homework" as const, subject: subjectOf(a.subjectId), id: a.id } })),
    ...recordingTodo,
    ...newResults,
  ];
  const toDoCount = todo.filter((x) => !x.quiet).length;
  // A class about to start or running turns the class card gold with its Join
  // button: then that is the one gold action on Home, and everything else stays outlined.
  const classOn = slotsForStudent(db, student, pkDate(nowMs)).some((sl) => nowMs >= sl.startMs - JOIN_EARLY_MIN * 60_000 && nowMs < sl.endMs);
  // Otherwise one gold button on the list: the most urgent item. The rest stay quiet.
  const lead = classOn ? undefined : todo.find((x) => !x.quiet)?.key;

  return (
    // Phones and tablets: one column. Laptops: what to do now on the left, how
    // the week is going on the right (the same order, read left then right).
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-4 sm:px-6 sm:pt-8 lg:max-w-6xl">
      <div className="space-y-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22.5rem)] lg:items-start lg:gap-x-8 lg:space-y-0">
      {/* One entrance for the page: each block rises in, 70ms apart. */}
      <div className="rise space-y-10">
        {/* The greeting and the next class are one thought: 12px apart, then the usual gap to the next section. */}
        <div className="space-y-3">
          <HomeHero name={displayName(student.username).split(" ")[0]} status={status} studentId={student.id} totalMinutes={profile.focus?.totalMinutes} />
          <ClassNow db={db} student={student} nowMs={nowMs} nextOnPhone={false} />
        </div>
        {/* Phones: Classes has no tab of its own (it lives on Home, like the phone app). */}
        <YourClasses db={db} student={student} nowMs={nowMs} />
        <NotifyCard />

        {todo.length > 0 && (
          <section aria-labelledby="todo-title">
            <SectionTitle id="todo-title" count={toDoCount}>
              {todo.some((x) => x.focus) ? "To do" : "New for you"}
            </SectionTitle>
            <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
              {todo.map((x) => (
                // The whole row opens the item (a stretched link); "Focus on this" sits on top of it.
                // Phones: the title gets the full width, with the date and buttons on the line under it.
                // Wider screens: title and date on the left, buttons on the right.
                <li
                  key={x.key}
                  className="row-link relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-4 [grid-template-areas:'title_title'_'meta_meta'_'actions_actions'] sm:gap-y-0.5 sm:px-6 sm:[grid-template-areas:'title_actions'_'meta_actions']"
                >
                  <Link
                    href={x.href}
                    className="line-clamp-2 break-words text-base font-semibold text-ink [grid-area:title] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand"
                  >
                    {x.title}
                    <span className="sr-only">, {x.cta}</span>
                  </Link>
                  <span className="block text-sm text-ink-3 tabular-nums [grid-area:meta]">{x.meta}</span>
                  <span className="flex items-center justify-end gap-3 max-sm:mt-1 [grid-area:actions]">
                    {x.focus && <FocusOnThis kind={x.focus.kind} title={x.title} subject={x.focus.subject} href={x.href} id={x.focus.id} />}
                    <span
                      aria-hidden
                      className={buttonClasses({ variant: x.key === lead ? "primary" : "secondary", size: "sm", className: "shrink-0" })}
                    >
                      {x.ctaShort ? (
                        <>
                          <span className="sm:hidden">{x.ctaShort}</span>
                          <span className="hidden sm:inline">{x.cta}</span>
                        </>
                      ) : (
                        x.cta
                      )}{" "}
                      <Icon.ChevronRight className="h-4 w-4" />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {todo.length === 0 && (
          <div className="surface flex items-center gap-4 rounded-card p-5 sm:p-6">
            <p className="text-base text-ink-2">
              <span className="block font-semibold text-ink">Nothing due right now.</span>
              Good time to read a chapter or try your Daily 5.
            </p>
          </div>
        )}

        {/* Hamza's notices: high up, but one line each so the day's work stays in view. */}
        <AnnouncementsPanel student={student} />
      </div>

      <div className="rise space-y-10">
        {/* One study card, a row each: Daily 5 (five quick past paper questions
            from covered chapters), today's mission, and Groundwork with its
            focus block Start. That Start stays quiet while something above has the gold one. */}
        <section aria-label="Study">
          <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
            <DailyFive books={books} />
            <StudyBuddy db={db} student={student} nowMs={nowMs} mission={mission} quiet={toDoCount > 0 || classOn} />
          </ul>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <PerformanceCard perf={perf} attendance={attendance} syllabus={syllabus} target={target} />
          <PlanCard week={week} plan={plan} nowMs={nowMs} workOn={perf && perf.marked >= 3 ? perf.weakest : []} />
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * Phones only: the next few classes, then a row to the full timetable. A class
 * about to start or running is the gold card above (ClassNow, with Join), so it
 * is not listed again here.
 */
function YourClasses({ db, student, nowMs }: { db: Database; student: Student; nowMs: number }) {
  const today = pkDate(nowMs);
  const next: DaySlot[] = [];
  for (let d = today, i = 0; next.length < 3 && i < 21; d = addDays(d, 1), i++) {
    for (const sl of slotsForStudent(db, student, d)) {
      if (sl.startMs - JOIN_EARLY_MIN * 60_000 > nowMs && next.length < 3) next.push(sl);
    }
  }
  const dayWord = (ymd: string) =>
    ymd === today
      ? "Today"
      : ymd === addDays(today, 1)
        ? "Tomorrow"
        : new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });
  return (
    <section aria-labelledby="classes-title" className="md:hidden">
      <SectionTitle id="classes-title">Your classes</SectionTitle>
      <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
        {next.length === 0 && <li className="px-5 py-4 text-base text-ink-2">No classes in the next three weeks.</li>}
        {next.map((sl) => (
          <li key={slotKey(sl)} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <span className="min-w-0 truncate text-base font-semibold text-ink">{sl.subject}</span>
            <span className="shrink-0 text-sm text-ink-2 tabular-nums">
              {dayWord(sl.date)}, <span className="whitespace-nowrap">{clockHere(sl.date, sl.start)}</span>
            </span>
          </li>
        ))}
        <li>
          <Link href="/classes" className="row-link flex min-h-12 items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
            Full timetable
            <Icon.ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        </li>
      </ul>
    </section>
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
        {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Karachi" })}
      </p>
      <h1 className="mt-2 break-words text-title font-bold tracking-[-0.025em] text-ink [text-shadow:0_2px_18px_rgba(0,0,0,0.35)] sm:text-title-lg">
        {greeting()}, {name}.
      </h1>
      <p className="mt-3 max-w-[40ch] text-base leading-relaxed text-pretty text-ink-2">{status}</p>
    </IslandHeader>
  );
}

/** A card's title with its "see more" link on the same line, to keep the card short. */
function CardHead({ title, more }: { title: string; more: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-lg font-bold tracking-[-0.01em] text-ink">{title}</p>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-2">
        {more} <Icon.ChevronRight className="h-4 w-4" />
      </span>
    </div>
  );
}

/**
 * One strip: grade, attendance and syllabus covered, plus the topics to work
 * on. The trend, the line chart and each subject against its target live on
 * Progress, one tap away.
 */
function PerformanceCard({ perf, attendance, syllabus, target }: { perf: Snapshot | null; attendance: { percent: number; month: string } | null; syllabus: { covered: number; total: number } | null; target?: string }) {
  const graded = !!perf && perf.marked >= 3;
  return (
    <Link href="/progress" className="surface surface-link block rounded-card p-5 sm:p-6">
      <CardHead title="How you're doing" more="Full progress" />
      {!graded && (
        <p className="mt-2 text-base text-ink-2">
          {perf ? `${perf.marked} of 3 tests marked. ` : ""}Your grade shows here after three marked tests.
        </p>
      )}
      {(graded || attendance != null || syllabus != null) && (
        <dl className="mt-3 grid grid-cols-3 gap-3">
          {graded && (
            <div>
              <dt className="text-xs text-ink-3">Grade</dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-lg font-bold text-ink">{perf.grade}</span>
                <span className="text-xs text-ink-2">{shownPercent(perf.recent)}% avg</span>
              </dd>
              {target && <dd className="mt-0.5 text-xs text-ink-3">Target {target}</dd>}
            </div>
          )}
          {attendance != null && (
            <div>
              <dt className="text-xs text-ink-3">Attendance</dt>
              <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", attendance.percent >= 75 ? "text-ink" : "text-warning")}>{Math.round(attendance.percent)}%</dd>
              <dd className="mt-0.5 text-xs text-ink-3">{attendance.month}</dd>
            </div>
          )}
          {syllabus != null && (
            <div>
              <dt className="text-xs text-ink-3">Chapters</dt>
              <dd className="mt-0.5 flex items-baseline gap-1 tabular-nums">
                <span className="text-lg font-bold text-ink">{syllabus.covered}</span>
                <span className="text-xs text-ink-2">of {syllabus.total}</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {graded && perf.weakest.length > 0 && (
        <p className="mt-3 line-clamp-2 text-sm text-ink-2">
          Work on:{" "}
          {perf.weakest.map((w, i) => (
            <span key={`${w.subject}|${w.name}`}>
              {i > 0 && ", "}
              <span className="font-semibold text-ink">{w.name}</span> <span className="text-ink-3">{w.percent}%</span>
            </span>
          ))}
        </p>
      )}
    </Link>
  );
}

const topicKey = (t: { subject: string; name: string }) => `${t.subject.trim().toLowerCase()}|${t.name.trim().toLowerCase()}`;

function PlanCard({ week, plan, nowMs, workOn }: { week: PlanWeek | null; plan: StudyPlan; nowMs: number; workOn: Array<{ subject: string; name: string }> }) {
  const daysLeft = plan.daysLeft;
  // This student's own next paper (Cambridge's timetable), when their papers are known.
  const paper = nextExam(plan.papers, nowMs);
  const first = paper && plan.papers[0] === paper;
  // This week's topics are often the same as "Work on" just above (both start
  // from the weakest topics): then the chips would only repeat it, so they show
  // only when the week brings a topic that line does not already name.
  const shown = new Set(workOn.map(topicKey));
  const topics = week?.topics ?? [];
  const newTopics = topics.some((t) => !shown.has(topicKey(t)));
  return (
    <Link href="/plan" className="surface surface-link block rounded-card p-5 sm:p-6">
      <CardHead title="This week" more="See your full plan" />
      {paper ? (
        // The countdown to their own paper: the number, then which paper and the day it is sat.
        <div className="mt-3 flex items-center gap-4">
          <p className="min-w-[2ch] text-title font-bold leading-none tracking-[-0.025em] text-ink tabular-nums">{daysLeft}</p>
          <p className="min-w-0 text-sm leading-snug text-ink-2">
            <span className="block">
              {daysLeft === 0 ? "Today:" : `${daysLeft === 1 ? "day" : "days"} to your ${first ? "first" : "next"} paper`}
            </span>
            <span className="block truncate font-semibold text-ink">
              {paperName(paper)}
              <span className="font-normal text-ink-3"> · {examDateLabel(paper.date, nowMs)}</span>
            </span>
          </p>
        </div>
      ) : plan.papers.length > 0 ? (
        // Every paper is behind them.
        <p className="mt-2 text-base text-ink-2">Your exams are done. Well done.</p>
      ) : (
        <p className="mt-2 text-sm text-ink-2 tabular-nums">
          <span className="font-bold text-ink">{daysLeft}</span> {daysLeft === 1 ? "day" : "days"} to exams
        </p>
      )}
      {week && (
        <p className={cn("text-sm text-ink-2 tabular-nums", paper ? "mt-3 border-t border-hairline pt-3" : "mt-1")}>
          {PHASE_LABEL[week.phase]}
          {week.tests.length > 0 && <> · {week.tests.length === 1 ? "1 test" : `${week.tests.length} tests`} this week</>}
        </p>
      )}
      {topics.length === 0 ? (
        <p className="mt-1.5 text-base text-ink-2">Revise this week&apos;s class topics from your notes.</p>
      ) : (
        newTopics && (
          <div className="mt-3 flex flex-wrap gap-2">
            {topics.map((t) => (
              <TopicChip key={topicKey(t)} t={t} />
            ))}
          </div>
        )
      )}
    </Link>
  );
}
