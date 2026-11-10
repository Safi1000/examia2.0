"use client";

import { Icon } from "@/components/ui";
import { LEVEL_LABEL, clock, span, type DaySlot } from "@/lib/timetable";

/** "Start class": the one thing Hamza needs as a class comes up. */
export function StartCard({ slot, url, nowMs }: { slot: DaySlot; url: string | null; nowMs: number }) {
  const live = nowMs >= slot.startMs;
  const mins = Math.max(1, Math.round((slot.startMs - nowMs) / 60_000));
  return (
    <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand/25 bg-surface bg-[linear-gradient(180deg,rgba(251,193,89,0.07),rgba(251,193,89,0)_70%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">
          <span className="h-2 w-2 rounded-full bg-brand motion-safe:animate-low-pulse" />
          {live ? "Live now" : mins < 60 ? `Starts in ${mins} min` : `Next at ${clock(slot.start)}`}
        </p>
        <h2 className="mt-1.5 text-2xl font-bold tracking-[-0.02em] text-ink">
          {slot.subject} <span className="text-lg font-semibold text-ink-2">· {LEVEL_LABEL[slot.level]}</span>
        </h2>
        <p className="text-sm text-ink-2">
          {span(slot.start, slot.end)}
        </p>
      </div>
      {url ? (
        <div className="flex flex-col items-end gap-1.5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              // One tap: Meet opens in a new tab, and this tab becomes the board, ready to share.
              setTimeout(() => window.location.assign("/teach/present"), 300);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-base font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
          >
            Start class <Icon.ChevronRight className="h-4 w-4" />
          </a>
          <p className="text-xs text-ink-3">Opens Meet, and turns this tab into the board to share.</p>
        </div>
      ) : (
        <p className="max-w-[16rem] text-sm text-ink-2">No Meet link yet. If Google is connected it appears here automatically; or open More on the class to paste one.</p>
      )}
    </section>
  );
}
