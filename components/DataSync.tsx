"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStore } from "@/lib/data/store";

/** Ignore focus flurries — at most one refresh per this window. */
const MIN_INTERVAL_MS = 10_000;

/**
 * Keeps the in-memory cache honest.
 *
 * The store used to hydrate exactly once, at login, and never again — so a
 * teacher's edits (new MCQ options, a fresh note) stayed invisible to anyone
 * already signed in until they hard-reloaded. This re-reads the database when
 * the tab regains focus.
 *
 * Event-driven on purpose: no interval, no polling. A hidden tab costs nothing.
 */
export function DataSync() {
  const { session, initializing } = useAuth();
  const lastRun = useRef(0);

  useEffect(() => {
    if (initializing || !session) return;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRun.current < MIN_INTERVAL_MS) return;
      lastRun.current = now;
      void getStore().refresh();
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [session, initializing]);

  return null;
}
