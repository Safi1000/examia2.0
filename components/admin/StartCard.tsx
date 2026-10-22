"use client";

import { Icon } from "@/components/ui";
import { LEVEL_LABEL, timeLabel, type DaySlot } from "@/lib/timetable";

/** "Start class": the one thing Hamza needs as a class comes up. */
export function StartCard({ slot, url, nowMs }: { slot: DaySlot; url: string | null; nowMs: number }) {
  const live = nowMs >= slot.startMs;
  const mins = Math.max(1, Math.round((slot.startMs - nowMs) / 60_000));
  return (
    <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand/30 bg-[linear-gradient(135deg,rgba(251,193,89,0.16),rgba(251,193,89,0.04))] p-5">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">
          <span className="h-2 w-2 animate-low-pulse rounded-full bg-brand" />
          {live ? "Live now" : mins < 60 ? `Starts in ${mins} min` : `Next at ${timeLabel(slot.start)} PM`}
        </p>
        <h2 className="mt-1.5 text-2xl font-extrabold tracking-[-0.01em] text-ink">
          {slot.subject} <span className="text-lg font-semibold text-ink-2">· {LEVEL_LABEL[slot.level]}</span>
        </h2>
        <p className="text-sm text-ink-2">
          {timeLabel(slot.start)} to {timeLabel(slot.end)} PM
        </p>
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-base font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
        >
          Start class <Icon.ChevronRight className="h-4 w-4" />
        </a>
      ) : (
        <p className="max-w-[16rem] text-sm text-ink-2">The Meet link appears here at 1 pm. Or open More on the class to paste one.</p>
      )}
    </section>
  );
}
