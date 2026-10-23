"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById } from "@/lib/data/selectors";
import { STUDY_NAME, currentStats, levelFor } from "@/lib/focus";
import { todaysMission, useTopThree } from "@/components/student/StudyBuddy";
import { StudyStats } from "@/components/student/StudyStats";
import { studentSubjects } from "@/components/student/Welcome";
import { Avatar } from "@/components/student/Avatar";
import { Icon } from "@/components/ui";
import type { Mission } from "@/components/student/FocusMode";

const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });
const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const medal = ["🥇", "🥈", "🥉"];

/**
 * Groundwork: the student's study space outside class. Start a session (or
 * today's mission), see the week against their goal, the cohort's top 3, and
 * their level and study calendar.
 */
export default function GroundworkPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const [open, setOpen] = useState<null | { mission: Mission | null }>(null);
  const top = useTopThree();
  if (!student) return null;

  const stats = currentStats(profile.focus, nowMs);
  const level = levelFor(stats.totalMinutes ?? 0);
  const goal = (profile.weeklyGoal ?? 5) * 60;
  const pct = Math.min(1, stats.weekMinutes / goal);
  const mission = todaysMission(db, student, nowMs);
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">Your study, outside class</p>
        <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">{STUDY_NAME}</h1>
      </header>

      <section className="grid items-stretch gap-3 sm:grid-cols-5">
        <div className="flex items-center gap-5 rounded-lg border border-border bg-surface p-5 sm:col-span-3">
          <div className="relative shrink-0">
            <svg width="124" height="124" viewBox="0 0 124 124" className="-rotate-90" aria-hidden>
              <circle cx="62" cy="62" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
              {pct > 0 && <circle cx="62" cy="62" r={R} fill="none" stroke="var(--color-brand)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} />}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold tabular-nums text-ink">{Math.round(pct * 100)}%</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-3">of goal</span>
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-ink-2">This week</p>
            <p className="text-2xl font-extrabold text-ink">{fmt(stats.weekMinutes)}</p>
            <p className="text-sm text-ink-3">of {profile.weeklyGoal ?? 5} hours</p>
            <p className="mt-2 text-sm">
              <span className="font-semibold text-ink">{level.name}</span>
              {stats.streak > 1 && <span className="text-brand"> · {stats.streak}-day streak</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-brand/30 bg-[linear-gradient(135deg,rgba(251,193,89,0.16),rgba(251,193,89,0.04))] p-5 sm:col-span-2">
          {mission ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-brand">Today&apos;s mission</p>
              <p className="mt-1.5 text-lg font-extrabold leading-tight text-ink">{mission.topic}</p>
              <p className="text-sm text-ink-2">{mission.subject} · 25 min</p>
            </div>
          ) : (
            <p className="text-sm text-ink-2">Pick a subject and start. Every minute counts towards your week.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {mission && (
              <button type="button" onClick={() => setOpen({ mission })} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand">
                Start mission <Icon.ChevronRight className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen({ mission: null })}
              className={mission ? "h-11 rounded-full border border-border-strong px-5 text-sm font-semibold text-ink" : "inline-flex h-11 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand"}
            >
              {mission ? "Free session" : "Start a session"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Top this week</h2>
        <p className="mt-0.5 text-xs text-ink-3">Your cohort, by study hours. Resets every Monday.</p>
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
          <p className="mt-4 border-t border-border pt-3 text-sm text-ink-2">
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
