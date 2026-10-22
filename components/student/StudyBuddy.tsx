"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createPortal } from "react-dom";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useAuth } from "@/lib/auth-context";
import { STUDY_NAME, currentStats, levelFor } from "@/lib/focus";
import { performanceSnapshot } from "@/lib/performance";
import { buildStudyPlan } from "@/lib/study-plan";
import { studentSubjects } from "@/components/student/Welcome";
import { Avatar } from "@/components/student/Avatar";
import { Icon } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import type { Mission } from "@/components/student/FocusMode";

// The timer screen loads only when it's opened.
const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });

export interface TopThree {
  top: Array<{ name: string; avatar?: string; minutes: number }>;
  me: { rank: number; minutes: number } | null;
}

/** This week's top 3 study hours in the student's cohort (first names only). */
export function useTopThree(): TopThree | null {
  const [data, setData] = useState<TopThree | null>(null);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    void (async () => {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch("/api/leaderboard", { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      if (alive && res.ok) setData((await res.json()) as TopThree);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** One topic to work on today: their weakest marked topic, else this week's plan focus. */
export function todaysMission(db: Database, student: Student, nowMs: number): Mission | null {
  const weak = performanceSnapshot(db, student)?.weakest[0];
  const planned = buildStudyPlan(db, student, nowMs).weeks.find((w) => w.isCurrent)?.topics[0];
  const pick = weak ? { subject: weak.subject, topic: weak.name } : planned ? { subject: planned.subject, topic: planned.name } : null;
  if (!pick) return null;
  const hasNote = db.notes.some((n) => n.title.toLowerCase().includes(pick.topic.toLowerCase()));
  return { ...pick, noteHref: hasNote ? "/notes" : undefined };
}

const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const medal = ["🥇", "🥈", "🥉"];

/**
 * Home card for the study space: today's mission, this week's time against the
 * student's goal, their level and streak, and the cohort's top 3 this week.
 */
export function StudyBuddy({ db, student, nowMs }: { db: Database; student: Student; nowMs: number }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState<null | "free" | "mission">(null);
  const stats = currentStats(profile.focus, nowMs);
  const level = levelFor(stats.totalMinutes ?? 0);
  const goalMin = (profile.weeklyGoal ?? 5) * 60;
  const pct = Math.min(1, stats.weekMinutes / goalMin);
  const mission = todaysMission(db, student, nowMs);
  const top = useTopThree();
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <>
      <section className="animate-fade-up overflow-hidden rounded-lg border border-border bg-surface">
        {mission && (
          <button
            type="button"
            onClick={() => setOpen("mission")}
            className="flex w-full items-center justify-between gap-3 border-b border-border bg-brand/[0.06] px-5 py-3.5 text-left transition-colors hover:bg-brand/[0.1]"
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-brand">Today&apos;s mission</span>
              <span className="block truncate text-sm text-ink">
                <span className="font-semibold">{mission.topic}</span> <span className="text-ink-3">· {mission.subject} · 25 min</span>
              </span>
            </span>
            <Icon.ChevronRight className="h-4 w-4 shrink-0 text-brand" />
          </button>
        )}
        <div className="flex items-center gap-4 p-5">
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0 -rotate-90">
            <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
            {pct > 0 && <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />}
          </svg>
          <div className="min-w-0 flex-1">
            <Link href="/groundwork" className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-3 hover:text-brand">
              {STUDY_NAME} →
            </Link>
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-semibold text-ink">{fmt(stats.weekMinutes)}</span> of {profile.weeklyGoal ?? 5} h this week
            </p>
            <p className="text-xs text-ink-3">
              {level.name}
              {stats.streak > 1 && <span className="text-brand"> · {stats.streak}-day streak</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen("free")}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
          >
            Start <Icon.ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {top && top.top.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-3">Top this week</span>
            {top.top.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-ink-2">
                <span aria-hidden>{medal[i]}</span>
                <Avatar id={t.avatar} initials={t.name[0]} className="h-5 w-5 text-[10px]" />
                <span className="font-semibold text-ink">{t.name}</span> {fmt(t.minutes)}
              </span>
            ))}
          </div>
        )}
      </section>
      {open &&
        createPortal(
          <FocusMode subjects={studentSubjects(db, student)} mission={open === "mission" ? mission : null} onClose={() => setOpen(null)} />,
          document.body,
        )}
    </>
  );
}
