"use client";

import Link from "next/link";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { Icon } from "@/components/ui";
import { formatRelative } from "@/lib/time";
import { JOIN_EARLY_MIN, joinClass, pkDate, slotKey, slotsForStudent, timeLabel, useClassLinks } from "@/lib/classes";

/**
 * Home-screen class card. Quiet unless a class is close: from 10 minutes
 * before the start it turns gold with a Join button (once Hamza has pasted the
 * link). Tapping Join marks the student present.
 */
export function ClassNow({ db, student, nowMs }: { db: Database; student: Student; nowMs: number }) {
  const today = pkDate(nowMs);
  const { links, ready } = useClassLinks(today, today);
  const slots = slotsForStudent(db, student, today);
  if (ready === false) return null;

  const current = slots.find((s) => nowMs >= s.startMs - JOIN_EARLY_MIN * 6e4 && nowMs < s.endMs);
  const next = slots.find((s) => s.startMs > nowMs);

  if (!current) {
    if (!next) return null;
    return (
      <Link
        href="/classes"
        className="animate-fade-up flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-border-strong"
      >
        <span className="text-sm text-ink-2">
          Next class: <span className="font-semibold text-ink">{next.subject}</span> at {timeLabel(next.start)} PM
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
            {timeLabel(current.start)} to {timeLabel(current.end)}
          </p>
        </div>
        {url ? (
          <a
            href={url}
            onClick={async (e) => {
              // Record attendance first (at most 2.5 s), then go to Meet in this
              // tab, so switching to the Meet app can't cut the request off.
              e.preventDefault();
              const go = await Promise.race([joinClass(current, url), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
              window.location.href = go ?? url;
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-base font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
          >
            Join class <Icon.ChevronRight className="h-4 w-4" />
          </a>
        ) : (
          <p className="max-w-[16rem] text-sm text-ink-2">The Join button appears here when Hamza opens the class.</p>
        )}
      </div>
    </section>
  );
}
