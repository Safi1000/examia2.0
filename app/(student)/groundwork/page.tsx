"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { freeTime, planToday, type PlanItem } from "@/lib/groundwork-plan";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { reviewWeekDue, sceneFor } from "@/lib/groundwork";
import { pkDate } from "@/lib/timetable";
import { useTopThree } from "@/components/student/StudyBuddy";
import { StudyStats } from "@/components/student/StudyStats";
import { studentSubjects } from "@/components/student/Welcome";
import { Avatar } from "@/components/student/Avatar";
import { CalmStart } from "@/components/student/CalmStart";
import { SlotsCard, SundayReview, WeekCard } from "@/components/student/GroundworkCards";
import { ShareMoment } from "@/components/student/ShareMoment";
import type { Mission } from "@/components/student/FocusMode";

const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });
const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/**
 * Groundwork: the student's study space outside class. One calm screen first
 * (their scene, a greeting, the next thing, Start), then a few quiet sections:
 * the week, the rest of today, study times and their class. History folds away.
 */
export default function GroundworkPage() {
  const { session, profile, updateProfile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const router = useRouter();
  const [open, setOpen] = useState<null | { mission: Mission | null }>(null);
  const top = useTopThree();
  // The plan follows the clock in 5-minute steps, not every tick.
  const step = Math.floor(nowMs / 300_000);
  const plan = useMemo(() => (student ? planToday(db, student, profile, step * 300_000) : []), [db, student, profile, step]);
  const free = useMemo(() => (student ? freeTime(db, student, nowMs) : null), [db, student, nowMs]);
  if (!student || !free) return null;

  const name = displayName(student.username).split(" ")[0];
  const me = { id: student.id, name, avatar: profile.avatar };
  const startItem = (it: PlanItem | null) => {
    if (it?.href) return router.push(it.href);
    setOpen({ mission: it ? { subject: it.subject, topic: it.title, noteHref: it.noteHref, minutes: it.minutes, tag: it.tag } : null });
  };
  const sundayWeek = reviewWeekDue(profile.weekReviewed, nowMs);
  const scene = sceneFor(profile.scene, nowMs);
  // Goals and plans live here, below the quiet first screen.
  const oneThing = profile.today?.date === pkDate(nowMs) ? profile.today : null;
  const later = plan;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6 sm:pb-16 sm:pt-8">
      <CalmStart name={name} nowMs={nowMs} onStart={() => startItem(null)} />

      <div className="mt-10 space-y-10 sm:mt-12">
        {sundayWeek && <SundayReview week={sundayWeek} nowMs={nowMs} name={name} />}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-2 lg:gap-x-8">
          <Group title="This week">
            <WeekCard nowMs={nowMs} name={name} />
          </Group>

          {(later.length > 0 || oneThing) && (
            <Group title="Today">
              <ul className="divide-y divide-border overflow-hidden rounded-[22px] border border-border bg-surface">
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
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm ${oneThing.done ? "border-brand bg-brand text-on-brand" : "border-border-strong text-transparent hover:text-ink-3"}`}
                      aria-label={oneThing.done ? "Mark not done" : "Mark done"}
                    >
                      ✓
                    </button>
                  </li>
                )}
                {later.map((it) => (
                  <li key={it.key}>
                    <button type="button" onClick={() => startItem(it)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/50 active:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-ink-3">
                          {it.tag} · {it.subject}
                        </span>
                        <span className="block truncate text-[16px] font-semibold text-ink">{it.title}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-medium text-ink-2">{it.href ? "Open" : `${it.minutes} min`}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3" aria-hidden>
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </Group>
          )}

        </div>

        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-[22px] border border-border bg-surface px-5 py-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
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
            <div className="rounded-[22px] border border-border bg-surface p-2">
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
                <p className="px-3 py-3 text-sm text-ink-2">Nobody yet this week. One session puts you at the top.</p>
              )}
              {top?.me && top.me.rank > 3 && (
                <p className="border-t border-border px-3 pb-2 pt-3 text-sm text-ink-2">
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
