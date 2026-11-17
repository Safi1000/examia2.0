"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";

const isPaused = (user: { app_metadata?: unknown } | null | undefined) => (user?.app_metadata as { paused?: unknown } | undefined)?.paused === true;

/**
 * True while Hamza has paused this student's access (set from Students in the
 * teacher console). Read first from the sign-in already on the device, then
 * fresh from the server; checked again whenever the portal comes back to the
 * front and every few minutes, so a pause or a resume shows without signing
 * out. A failed check (weak signal) keeps the last answer.
 */
export function useAccessPaused(on: boolean): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    // Local preview only (never on the live site): /dashboard?demo=student&paused=1 shows the paused screen.
    if (DEMO) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address bar, client only
      setPaused(new URLSearchParams(window.location.search).get("paused") === "1");
      return;
    }
    if (!on) return;
    let alive = true;
    const check = async () => {
      try {
        const { data, error } = await supabase().auth.getUser();
        if (alive && !error && data.user) setPaused(isPaused(data.user));
      } catch {
        /* keep the last answer */
      }
    };
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (alive && isPaused(data.session?.user)) setPaused(true);
      })
      .catch(() => {});
    void check();
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    const every = setInterval(() => void check(), 5 * 60_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onShow);
      clearInterval(every);
    };
  }, [on]);
  return (on || DEMO) && paused;
}
