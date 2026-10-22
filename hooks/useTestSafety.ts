"use client";

import { useEffect, useState } from "react";

/**
 * Small things that protect a student mid-test:
 *  - keeps the phone screen awake (no lock screen halfway through a question)
 *  - warns before closing or refreshing the tab
 *  - tells the page when the internet drops or comes back
 */
export function useTestSafety({ active }: { active: boolean }) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  // Screen wake lock (re-requested when the tab comes back to the front).
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* low battery mode or not allowed: nothing to do */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);

  // "Leave site?" before closing or refreshing mid-test.
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  // Online / offline.
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return { online };
}
