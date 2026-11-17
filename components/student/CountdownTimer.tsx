"use client";

import type { TimerState } from "@/lib/time";
import { formatCountdown } from "@/lib/time";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

const stateStyle: Record<TimerState, string> = {
  normal: "border-border bg-surface text-ink",
  warning: "border-warning/40 bg-warning-soft text-warning",
  critical: "border-error/50 bg-error-soft text-error",
};

/**
 * Prominent mono countdown that bands color as time drains (pulses < 60s).
 * Not a live region: reading out the time every second drowns a screen
 * reader. The runner's toasts already announce 5 minutes and 1 minute left.
 */
export function CountdownTimer({ remaining, state }: { remaining: number; state: TimerState }) {
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label="Time remaining"
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-mono text-lg font-semibold tabular-nums transition-colors duration-200",
        stateStyle[state],
        state === "critical" && "animate-low-pulse",
      )}
    >
      <Icon.Clock className="h-4 w-4" />
      {formatCountdown(remaining)}
    </div>
  );
}
