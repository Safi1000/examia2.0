"use client";

import { useEffect, useMemo, useState } from "react";
import { HOMEWORK_CAP, freeTime, homeworkAhead, planToday, type PlanItem } from "@/lib/groundwork-plan";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { reviewWeekDue, worldScene } from "@/lib/groundwork";
import { pkDate } from "@/lib/timetable";
import { useTopThree } from "@/components/student/StudyBuddy";
import { StudyStats } from "@/components/student/StudyStats";
import { studentSubjects } from "@/components/student/Welcome";
import { Avatar } from "@/components/student/Avatar";
import { CalmStart } from "@/components/student/CalmStart";
import { SlotsCard, SundayReview, WeekCard } from "@/components/student/GroundworkCards";
import { ShareMoment } from "@/components/student/ShareMoment";
import { SyllabusCard, useTopicalIndex } from "@/components/student/SyllabusCard";
import { practiceToday, syllabusProgress } from "@/lib/syllabus-progress";
import Link from "next/link";
import type { Mission } from "@/components/student/FocusMode";

const loadFocusMode = () => import("@/components/student/FocusMode");
const FocusMode = dynamic(loadFocusMode, { ssr: false });
const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/**
 * Groundwork: the student's study space outside class. One calm screen first
 * (their 3D world, a greeting, the next thing, Start), then a few quiet sections:
 * the week, the rest of today, study times and their class. History folds away.
 */
export default function GroundworkPage() {
  const { session, profile, updateProfile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const [open, setOpen] = useState<null | { mission: Mission | null }>(null);
  const top = useTopThree();
  // The plan follows the clock in 5-minute steps, not every tick.
  const step = Math.floor(nowMs / 300_000);
  const plan = useMemo(() => (student ? planToday(db, student, profile, step * 300_000) : []), [db, student, profile, step]);
  // Homework past the plan's few: a quiet line points to the rest.
  const moreHomework = useMemo(() => (student ? Math.max(0, homeworkAhead(db, student, step * 300_000).length - HOMEWORK_CAP) : 0), [db, student, step]);
  const free = useMemo(() => (student ? freeTime(db, student, nowMs) : null), [db, student, nowMs]);
  // Syllabus progress from the notes released so far, and past paper practice from it.
  const books = useMemo(() => (student ? syllabusProgress(db, student) : []), [db, student]);
  const index = useTopicalIndex();
  const practice = useMemo(() => practiceToday(books, index, step * 300_000), [books, index, step]);
  // Fetch the focus room's code once the page is idle, so Start opens it at once.
  useEffect(() => {
    const go = () => void loadFocusMode().catch(() => {});
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(go, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(go, 2000);
    return () => clearTimeout(t);
  }, []);
  if (!student || !free) return null;

  const name = displayName(student.username).split(" ")[0];
  const me = { id: student.id, name, avatar: profile.avatar };
  // Every item starts a block; a test or homework goes in as the block's item, so its minutes count against it.
  const startItem = (it: PlanItem | null) => {
    setOpen({
      mission: it
        ? {
            subject: it.subject,
            topic: it.title,
            noteHref: it.noteHref,
            minutes: it.minutes,
            tag: it.tag,
            item: it.item ? { kind: it.item.kind, title: it.title, href: it.item.href, id: it.item.id } : undefined,
          }
        : null,
    });
  };
  const sundayWeek = reviewWeekDue(profile.weekReviewed, nowMs);
  const scene = worldScene(profile.world);
  // Goals and plans live here, below the quiet first screen.
  const oneThing = profile.today?.date === pkDate(nowMs) ? profile.today : null;
  const later = plan;

  return (
    <div>
      <CalmStart name={name} nowMs={nowMs} onStart={() => startItem(null)} away={!!open} />

      {/* The rest slides up over the world as a frosted sheet. */}
      <div id="groundwork-more" className="scroll-mt-[68px] rounded-t-[32px] border-t border-white/[0.08] bg-paper shadow-[0_-30px_60px_-30px_rgba(0,0,0,.6)]">
      <div className="mx-auto max-w-5xl space-y-10 px-4 pb-32 pt-8 sm:px-6 sm:pb-16 sm:pt-10">
        {sundayWeek && <SundayReview week={sundayWeek} nowMs={nowMs} name={name} />}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:gap-x-8">
          <Group title="This week">
            <WeekCard nowMs={nowMs} name={name} />
          </Group>

          {(later.length > 0 || oneThing || practice.length > 0) && (
            <Group title="Today">
              <ul className="surface divide-y divide-hairline overflow-hidden rounded-[22px]">
                {oneThing && (
                  <li className="flex items-center gap-4 px-5 py-4">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-ink-3">My one thing</span>
                      <span className={`block truncate text-[16px] font-semibold text-ink ${oneThing.done ? "line-through opacity-60" : ""}`}>{oneThing.text}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => updateProfile({ today: { ...oneThing, done: !oneThing.done } })}
                      aria-pressed={!!oneThing.done}
                      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm after:absolute after:-inset-1 after:content-[''] ${oneThing.done ? "border-brand bg-brand text-on-brand" : "border-border-strong text-transparent hover:text-ink-3"}`}
                      aria-label={oneThing.done ? "Mark not done" : "Mark done"}
                    >
                      ✓
                    </button>
                  </li>
                )}
                {later.map((it) => (
                  <li key={it.key} className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => startItem(it)}
                      aria-label={`Start ${it.minutes} minutes on ${it.title}`}
                      className="row-link flex min-w-0 flex-1 items-center gap-4 py-4 pl-5 pr-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-ink-3">
                          {it.tag} · {it.subject}
                          {it.kind === "homework" ? ` · ${it.why}` : ""}
                        </span>
                        <span className="line-clamp-2 block text-[16px] font-semibold text-ink">{it.title}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink-2">{it.minutes} min</span>
                      {!it.item?.href && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3" aria-hidden>
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      )}
                    </button>
                    {/* The homework page itself (the worksheet, and handing in), kept to a small link. */}
                    {it.item?.href && (
                      <Link
                        href={it.item.href}
                        aria-label={`Open ${it.title} on the Homework page`}
                        className="row-link flex min-w-11 shrink-0 items-center px-4 text-[13px] font-medium text-ink-3 underline-offset-4 hover:text-ink hover:underline"
                      >
                        Open
                      </Link>
                    )}
                  </li>
                ))}
                {moreHomework > 0 && (
                  <li>
                    <Link href="/assignments" className="row-link flex min-h-11 items-center px-5 py-3 text-[13px] text-ink-3 hover:text-ink">
                      {moreHomework} more homework on your Homework page
                    </Link>
                  </li>
                )}
                {practice.map((p) => (
                  <li key={p.key}>
                    <Link href={p.href} className="row-link flex w-full items-center gap-4 px-5 py-4 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-ink-3">
                          {p.fresh ? "Past papers · new this week" : "Past papers · keep it fresh"} · {p.subject}
                        </span>
                        <span className="line-clamp-2 block text-[16px] font-semibold text-ink">{p.chapter.name}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-medium text-ink-2">{p.count} questions</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3" aria-hidden>
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </Group>
          )}

        </div>

        {books.length > 0 && (
          <Group title="Syllabus">
            <SyllabusCard books={books} index={index} />
          </Group>
        )}

        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between surface surface-link rounded-[22px] px-5 py-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            More: study times, your class, history
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 transition-transform group-open:rotate-90" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </summary>
          <div className="mt-6 space-y-10">
          <Group title="Study times">
            <SlotsCard nowMs={nowMs} />
          </Group>

          <Group
            title="Your class this week"
            action={
              top?.me && top.me.rank <= 3 && top.me.minutes > 0 ? (
                <ShareMoment
                  label="Share"
                  moment={{ kicker: "Groundwork · top this week", big: top.me.rank === 1 ? "#1 in my class" : `Top ${top.me.rank} in my class`, sub: `${fmt(top.me.minutes)} of study this week`, name, scene }}
                />
              ) : null
            }
          >
            <div className="surface rounded-[22px] p-2">
              {top && top.top.length > 0 ? (
                <ol>
                  {top.top.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                      <span className="w-5 text-center text-sm font-semibold tabular-nums text-ink-3">{i + 1}</span>
                      <Avatar id={t.avatar} initials={t.name[0]} level={t.level} className="h-9 w-9 text-sm" />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.name}</span>
                      <span className="tabular-nums text-sm text-ink-2">{fmt(t.minutes)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-3 py-3 text-sm text-ink-2">{top ? "Nobody yet this week. One session puts you at the top." : "Your class's top three shows here."}</p>
              )}
              {top?.me && top.me.rank > 3 && (
                <p className="border-t border-hairline px-3 pb-2 pt-3 text-sm text-ink-2">
                  You&apos;re <span className="font-semibold text-ink">#{top.me.rank}</span> with {fmt(top.me.minutes)}.
                </p>
              )}
            </div>
          </Group>
            <Group title="Your study history">
              <StudyStats nowMs={nowMs} />
            </Group>
          </div>
        </details>
      </div>
      </div>

      {open &&
        createPortal(<FocusMode subjects={studentSubjects(db, student)} mission={open.mission} me={me} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
}

function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex min-h-9 items-center justify-between gap-3 px-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
