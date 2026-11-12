"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { Icon, Spinner } from "@/components/ui";
import { formatRelative } from "@/lib/time";
import { useSchedule, JOIN_EARLY_MIN, addDays, clockHere, spanHere, joinClass, pkDate, slotKey, slotsForStudent, useClassLinks, type DaySlot } from "@/lib/classes";

/**
 * Home-screen class card. Quiet unless a class is close: from 5 minutes
 * before the start it turns gold with a Join button (once Hamza has pasted the
 * link). Tapping Join marks the student present. With back-to-back classes the
 * running class and the next one show together, each with its own button.
 */
export function ClassNow({ db, student, nowMs }: { db: Database; student: Student; nowMs: number }) {
  const today = pkDate(nowMs);
  useSchedule(); // re-render when the timetable loads or changes
  const slots = slotsForStudent(db, student, today);
  // Only check for a fresh Meet link around class time, not all day.
  const nearClass = slots.some((s) => nowMs >= s.startMs - 20 * 60_000 && nowMs < s.endMs);
  const { links, ready } = useClassLinks(today, today, false, nearClass);
  const [joining, setJoining] = useState<string | null>(null);

  // Meet often opens in its own app and this page stays put underneath, or the
  // student comes back to it later: either way, Join must be tappable again
  // rather than stuck on "Joining…".
  useEffect(() => {
    if (!joining) return;
    const reset = () => setJoining(null);
    const onVisible = () => {
      if (document.visibilityState === "visible") reset();
    };
    window.addEventListener("pageshow", reset);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", reset);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [joining]);

  // The class links couldn't be read (weak signal): still show the timetable, and say why Join is missing.
  const offline = ready === false;

  // Back-to-back classes (3:30, 4:10, 4:50): from 5 minutes before the next
  // class, show both. The class still running stays first (so a student who
  // drops out can rejoin), and the next one sits under it with its own Join.
  const open = slots.filter((s) => nowMs >= s.startMs - JOIN_EARLY_MIN * 6e4 && nowMs < s.endMs);
  const live = open.filter((s) => nowMs >= s.startMs).pop();
  const upcoming = open.find((s) => nowMs < s.startMs);
  const current = live ?? upcoming;
  const after = live && upcoming ? upcoming : undefined;
  // Next class today, or else on the next class day (weekends, before term, late evening).
  let next = slots.find((s) => s.startMs > nowMs);
  for (let d = addDays(today, 1), i = 0; !next && i < 21; d = addDays(d, 1), i++) next = slotsForStudent(db, student, d)[0];

  if (!current) {
    if (!next) return null;
    return (
      <Link
        href="/classes"
        className="surface surface-link flex items-center justify-between gap-3 rounded-xl px-5 py-4 sm:px-6"
      >
        <span className="text-base text-ink-2">
          Next class: <span className="font-semibold text-ink">{next.subject}</span>{" "}
          {next.date === today
            ? "at "
            : next.date === addDays(today, 1)
              ? "tomorrow at "
              : `${new Date(`${next.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" })}, `}
          {/* "7:30 PM" never breaks across two lines. */}
          <span className="whitespace-nowrap">{clockHere(next.date, next.start)}</span>
        </span>
        <Icon.ChevronRight className="h-4 w-4 text-ink-3" />
      </Link>
    );
  }

  const urlFor = (slot: DaySlot) => links.find((l) => slotKey(l) === slotKey(slot))?.meetUrl ?? null;
  const url = urlFor(current);
  const started = nowMs >= current.startMs;

  async function join(slot: DaySlot, link: string) {
    // Record attendance first (at most 2.5 s), then go to Meet in this tab, so
    // switching to the Meet app can't cut the request off.
    if (joining) return;
    setJoining(slotKey(slot));
    const go = await Promise.race([joinClass(slot, link), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
    window.location.href = go ?? link;
    // Handed over to Meet: back to "Join class" shortly after.
    setTimeout(() => setJoining(null), 4000);
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-brand/30 bg-surface bg-[linear-gradient(135deg,rgba(251,193,89,0.16),rgba(251,193,89,0.04)_60%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_18px_40px_-22px_rgba(251,193,89,0.35)] sm:p-6">
      <p className="label-quiet flex items-center gap-2 text-brand">
        <span className="h-2 w-2 animate-low-pulse rounded-full bg-brand" />
        {started ? "Class is live" : `Starts ${formatRelative(new Date(current.startMs).toISOString(), nowMs)}`}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em] text-ink">{current.subject}</h2>
          {/* In the Gulf this reads "2:30 PM to 3:10 PM your time (3:30 to 4:10 PM Pakistan)", like the "Next class" line. */}
          <p className="mt-0.5 text-base text-ink-2 tabular-nums">{spanHere(current.date, current.start, current.end)}</p>
        </div>
        {url ? (
          <a
            href={url}
            aria-busy={joining === slotKey(current)}
            onClick={(e) => {
              e.preventDefault();
              void join(current, url);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-base font-semibold text-on-brand shadow-[0_10px_24px_-10px_rgba(251,193,89,0.75)] transition hover:brightness-110 active:scale-[0.98]"
          >
            {joining === slotKey(current) ? "Joining…" : <>{started && after ? "Rejoin" : "Join class"} <Icon.ChevronRight className="h-4 w-4" /></>}
          </a>
        ) : (
          <p className="max-w-[16rem] text-sm text-ink-2">{ready === null ? (
            <span className="inline-flex items-center gap-2"><Spinner size={15} />Getting your class link…</span>
          ) : offline ? "No connection right now. Join shows up here when you're back online." : "The Join button appears here when I open the class."}</p>
        )}
      </div>
      {after && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-brand/20 pt-4">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">Next: {after.subject}</span> at {clockHere(after.date, after.start)}
            <span className="text-ink-3"> · starts {formatRelative(new Date(after.startMs).toISOString(), nowMs)}</span>
          </p>
          {urlFor(after) ? (
            <a
              href={urlFor(after)!}
              aria-busy={joining === slotKey(after)}
              onClick={(e) => {
                e.preventDefault();
                void join(after, urlFor(after)!);
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-brand/50 px-5 text-sm font-semibold text-ink transition hover:bg-brand hover:text-on-brand"
            >
              {joining === slotKey(after) ? "Joining…" : <>Join {after.subject} <Icon.ChevronRight className="h-4 w-4" /></>}
            </a>
          ) : (
            <span className="text-xs text-ink-3">{ready === null ? "Checking…" : offline ? "Join shows up when you're back online." : "Join appears when I open it."}</span>
          )}
        </div>
      )}
    </section>
  );
}
