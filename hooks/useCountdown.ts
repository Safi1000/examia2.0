"use client";

import { useEffect, useRef, useState } from "react";
import { timerState, type TimerState } from "@/lib/time";
import { serverNow } from "@/lib/server-clock";

/**
 * Ticks once a second toward an absolute end time. Remaining is recomputed from
 * the wall clock each tick, so it stays correct after a backgrounded tab.
 *
 * The end time is on the server's clock (a test's start is recorded there),
 * so the countdown reads the server's clock too, corrected for a phone set to
 * the wrong time (see lib/server-clock).
 */
export function useCountdown(endMs: number | null, onExpire?: () => void) {
  const compute = () => (endMs == null ? 0 : Math.max(0, Math.round((endMs - serverNow()) / 1000)));
  const [remaining, setRemaining] = useState<number>(compute);
  const firedRef = useRef(false);
  // Latest-callback ref, assigned in an effect rather than during render.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    firedRef.current = false;
    if (endMs == null) return;

    const tick = () => {
      const next = Math.max(0, Math.round((endMs - serverNow()) / 1000));
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [endMs]);

  const state: TimerState = remaining <= 0 ? "critical" : timerState(remaining);
  return { remaining, state, expired: remaining <= 0 };
}
