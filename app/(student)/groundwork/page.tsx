"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { weakTopics } from "@/lib/performance";
import { reviewWeekDue, sceneFor } from "@/lib/groundwork";
import { todaysMission, useTopThree } from "@/components/student/StudyBuddy";
import { StudyStats } from "@/components/student/StudyStats";
import { studentSubjects } from "@/components/student/Welcome";
import { Avatar } from "@/components/student/Avatar";
import { CalmStart } from "@/components/student/CalmStart";
import { ReviewCard, SlotsCard, SundayReview, WeekCard } from "@/components/student/GroundworkCards";
import { ShareMoment } from "@/components/student/ShareMoment";
import type { Mission } from "@/components/student/FocusMode";

const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });
const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const medal = ["🥇", "🥈", "🥉"];

/**
 * Groundwork: the student's study space outside class. A calm start screen
 * (scene, time, today's one thing, quote), then the week against their days
 * target, their study times, the review queue, the Sunday review, the
 * cohort's top 3 and the study calendar.
 */
export default function GroundworkPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const [open, setOpen] = useState<null | { mission: Mission | null }>(null);
  const top = useTopThree();
  if (!student) return null;

  const name = displayName(student.username).split(" ")[0];
  const mission = todaysMission(db, student, nowMs);
  const weak = weakTopics(db, student);
  const sundayWeek = reviewWeekDue(profile.weekReviewed, nowMs);
  const scene = sceneFor(profile.scene, nowMs);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <CalmStart
        name={name}
        nowMs={nowMs}
        onStart={() => setOpen({ mission: null })}
        missionLabel={mission?.topic}
        onMission={mission ? () => setOpen({ mission }) : undefined}
      />

      {sundayWeek && <SundayReview week={sundayWeek} nowMs={nowMs} name={name} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <WeekCard nowMs={nowMs} name={name} />
        <SlotsCard nowMs={nowMs} />
      </div>

      <ReviewCard weak={weak} nowMs={nowMs} onStudy={(t) => setOpen({ mission: { subject: t.subject, topic: t.topic } })} />

      <section className="rounded-[22px] border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">Top this week</p>
            <p className="mt-1 text-xs text-ink-3">Your cohort, by study hours. Resets every Monday.</p>
          </div>
          {top?.me && top.me.rank <= 3 && top.me.minutes > 0 && (
            <ShareMoment
              label="Share"
              moment={{ kicker: "Groundwork · top this week", big: top.me.rank === 1 ? "#1 in my class" : `Top ${top.me.rank} in my class`, sub: `${fmt(top.me.minutes)} of study this week`, name, scene }}
            />
          )}
        </div>
        {top && top.top.length > 0 ? (
          <ol className="mt-4 space-y-4">
            {top.top.map((t, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-6 text-center text-lg" aria-label={`Number ${i + 1}`}>
                  {medal[i]}
                </span>
                <Avatar id={t.avatar} initials={t.name[0]} level={t.level} className="mx-2 my-1.5 h-10 w-10 text-sm" />
                <span className="flex-1 font-semibold text-ink">{t.name}</span>
                <span className="tabular-nums text-sm text-ink-2">{fmt(t.minutes)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-ink-2">Nobody yet this week. Start a session and take the top spot.</p>
        )}
        {top?.me && top.me.rank > 3 && (
          <p className="mt-4 text-sm text-ink-2">
            You&apos;re <span className="font-semibold text-ink">#{top.me.rank}</span> with {fmt(top.me.minutes)}.
          </p>
        )}
      </section>

      <StudyStats nowMs={nowMs} />

      {open &&
        createPortal(<FocusMode subjects={studentSubjects(db, student)} mission={open.mission} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
}
