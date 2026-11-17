"use client";

import { Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { LEVEL_LABEL, clock, span, type DaySlot } from "@/lib/timetable";

/** "Start class": the one thing Hamza needs as a class comes up. */
export function StartCard({ slot, url, nowMs }: { slot: DaySlot; url: string | null; nowMs: number }) {
  const live = nowMs >= slot.startMs;
  const mins = Math.max(1, Math.round((slot.startMs - nowMs) / 60_000));
  // The one gold-tinted card in the console: the class that is about to start.
  return (
    <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-card border border-brand/25 bg-[color-mix(in_srgb,var(--color-brand)_6%,var(--color-surface))] p-5 sm:p-6">
      <div>
        <p className="label-quiet flex items-center gap-2 text-brand">
          <span className="h-2 w-2 rounded-full bg-brand" />
          {live ? "Live now" : mins < 60 ? `Starts in ${mins} min` : `Next at ${clock(slot.start)}`}
        </p>
        <h2 className="mt-1.5 text-xl font-bold tracking-[-0.02em] text-ink">
          {slot.subject} <span className="text-base font-semibold text-ink-2">· {LEVEL_LABEL[slot.level]}</span>
        </h2>
        <p className="mt-0.5 text-sm tabular-nums text-ink-2">
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
            className={buttonClasses({ size: "lg" })}
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
