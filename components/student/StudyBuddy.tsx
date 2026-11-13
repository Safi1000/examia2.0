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
import { Icon } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import type { Mission } from "@/components/student/FocusMode";

// The timer screen loads only when it's opened.
const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });

export interface TopThree {
  top: Array<{ name: string; avatar?: string; minutes: number; level?: number }>;
  me: { rank: number; minutes: number } | null;
}

/** This week's top 3 study hours in the student's cohort (first names only). */
const TOP_KEY = "ht_top3";
export function useTopThree(): TopThree | null {
  // Shown straight from the last copy (fetched again after 30 minutes), so Home doesn't wait or jump.
  const [data, setData] = useState<TopThree | null>(() => {
    try {
      const c = JSON.parse(sessionStorage.getItem(TOP_KEY) ?? "null") as { at: number; v: TopThree } | null;
      return c ? c.v : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (DEMO) return;
    try {
      const c = JSON.parse(sessionStorage.getItem(TOP_KEY) ?? "null") as { at: number } | null;
      if (c && Date.now() - c.at < 30 * 60_000) return;
    } catch {}
    let alive = true;
    void (async () => {
      const { data: s } = await supabase().auth.getSession();
      const res = await fetch("/api/leaderboard", { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      if (!res.ok) return;
      const v = (await res.json()) as TopThree;
      try {
        sessionStorage.setItem(TOP_KEY, JSON.stringify({ at: Date.now(), v }));
      } catch {}
      if (alive) setData(v);
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
  // "Open the notes for it" opens that note straight away, not the whole list.
  const note = db.notes.find((n) => n.title.toLowerCase().includes(pick.topic.toLowerCase()));
  return { ...pick, noteHref: note ? `/notes?open=${note.id}` : undefined };
}

const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/**
 * Two rows for Home's study card: today's mission, then the study space with
 * this week's time against the student's goal, their level and streak, and a
 * Start for a free focus block. Home wraps them (with the Daily 5 row) in one
 * card; the cohort's top 3 lives on the Groundwork page.
 */
export function StudyBuddy({
  db,
  student,
  nowMs,
  mission: given,
  quiet,
}: {
  db: Database;
  student: Student;
  nowMs: number;
  mission?: Mission | null;
  /** Something else on the page has the gold button: Start stays outlined. */
  quiet?: boolean;
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState<null | "free" | "mission">(null);
  const stats = currentStats(profile.focus, nowMs);
  const level = levelFor(stats.totalMinutes ?? 0);
  const goalMin = (profile.weeklyGoal ?? 5) * 60;
  const pct = Math.min(1, stats.weekMinutes / goalMin);
  // Home passes the mission it already worked out; elsewhere it's computed here.
  const mission = given !== undefined ? given : todaysMission(db, student, nowMs);
  const r = 16;
  const c = 2 * Math.PI * r;

  // Plain rows (no card of their own): Home's study card draws the surface and the lines between them.
  return (
    <>
      {mission && (
        <li>
          <button
            type="button"
            onClick={() => setOpen("mission")}
            className="row-link flex w-full items-center gap-4 px-5 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-6"
          >
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-ink-2">
              <Icon.Flag className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Today&apos;s mission</span>
              <span className="block truncate text-sm text-ink-2">
                {mission.topic} <span className="text-ink-3">· {mission.subject} · 25 min</span>
              </span>
            </span>
            <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
          </button>
        </li>
      )}
      {/* The whole row opens Groundwork (a stretched link); Start sits on top of it. */}
      <li className="row-link relative flex items-center gap-4 px-5 py-3.5 sm:px-6">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="shrink-0 -rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="5" />
          {pct > 0 && <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />}
        </svg>
        <div className="min-w-0 flex-1">
          <Link
            href="/groundwork"
            className="block font-semibold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand"
          >
            {STUDY_NAME}
          </Link>
          <p className="text-sm text-ink-2 tabular-nums">
            <span className="font-semibold text-ink">{fmt(stats.weekMinutes)}</span> <span className="whitespace-nowrap">of {profile.weeklyGoal ?? 5} h this week</span>
          </p>
          <p className="text-xs text-ink-3">
            {level.name}
            {stats.streak > 1 && ` · ${stats.streak} day streak`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen("free")}
          aria-label={`Start a ${STUDY_NAME} focus block`}
          className={
            quiet
              ? "relative inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink transition hover:border-ink-3 hover:bg-surface-2 active:scale-[0.98]"
              : "relative inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
          }
        >
          Start <Icon.ChevronRight className="h-4 w-4" />
        </button>
      </li>
      {open &&
        createPortal(
          <FocusMode
            subjects={studentSubjects(db, student)}
            mission={open === "mission" ? mission : null}
            me={{ id: student.id, name: student.username, avatar: profile.avatar }}
            onClose={() => setOpen(null)}
          />,
          document.body,
        )}
    </>
  );
}
