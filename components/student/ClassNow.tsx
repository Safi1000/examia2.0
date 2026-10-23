"use client";

import { useState } from "react";

import Link from "next/link";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { Icon } from "@/components/ui";
import { formatRelative } from "@/lib/time";
import { useSchedule, JOIN_EARLY_MIN, addDays, clock, span, joinClass, pkDate, slotKey, slotsForStudent, useClassLinks } from "@/lib/classes";

/**
 * Home-screen class card. Quiet unless a class is close: from 10 minutes
 * before the start it turns gold with a Join button (once Hamza has pasted the
 * link). Tapping Join marks the student present.
 */
export function ClassNow({ db, student, nowMs }: { db: Database; student: Student; nowMs: number }) {
  const today = pkDate(nowMs);
  useSchedule(); // re-render when the timetable loads or changes
  const slots = slotsForStudent(db, student, today);
  // Only check for a fresh Meet link around class time, not all day.
  const nearClass = slots.some((s) => nowMs >= s.startMs - 20 * 60_000 && nowMs < s.endMs);
  const { links, ready } = useClassLinks(today, today, false, nearClass);
  const [joining, setJoining] = useState(false);
  if (ready === false) return null;

  const current = slots.find((s) => nowMs >= s.startMs - JOIN_EARLY_MIN * 6e4 && nowMs < s.endMs);
  // Next class today, or else on the next class day (weekends, before term, late evening).
  let next = slots.find((s) => s.startMs > nowMs);
  for (let d = addDays(today, 1), i = 0; !next && i < 21; d = addDays(d, 1), i++) next = slotsForStudent(db, student, d)[0];

  if (!current) {
    if (!next) return null;
    return (
      <Link
        href="/classes"
        className="animate-fade-up flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong"
      >
        <span className="text-sm text-ink-2">
          Next class: <span className="font-semibold text-ink">{next.subject}</span>{" "}
          {next.date === today
            ? `at ${clock(next.start)}`
            : `${new Date(`${next.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${clock(next.start)}`}
        </span>
        <Icon.ChevronRight className="h-4 w-4 text-ink-3" />
      </Link>
    );
  }

  const url = links.find((l) => slotKey(l) === slotKey(current))?.meetUrl ?? null;
  const started = nowMs >= current.startMs;

  return (
    <section className="animate-fade-up relative overflow-hidden rounded-lg border border-brand/30 bg-[linear-gradient(135deg,rgba(251,193,89,0.16),rgba(251,193,89,0.04))] p-5">
      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">
        <span className="h-2 w-2 animate-low-pulse rounded-full bg-brand" />
        {started ? "Class is live" : `Starts ${formatRelative(new Date(current.startMs).toISOString(), nowMs)}`}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] text-ink">{current.subject}</h2>
          <p className="text-sm text-ink-2">
            {span(current.start, current.end)}
          </p>
        </div>
        {url ? (
          <a
            href={url}
            aria-busy={joining}
            onClick={async (e) => {
              // Record attendance first (at most 2.5 s), then go to Meet in this
              // tab, so switching to the Meet app can't cut the request off.
              e.preventDefault();
              if (joining) return;
              setJoining(true);
              const go = await Promise.race([joinClass(current, url), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
              window.location.href = go ?? url;
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-base font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
          >
            {joining ? "Joining…" : <>Join class <Icon.ChevronRight className="h-4 w-4" /></>}
          </a>
        ) : (
          <p className="max-w-[16rem] text-sm text-ink-2">The Join button appears here when Hamza opens the class.</p>
        )}
      </div>
    </section>
  );
}
