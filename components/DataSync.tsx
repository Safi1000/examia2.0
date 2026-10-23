"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStore } from "@/lib/data/store";

/**
 * At most one refresh per this window. Short trips (WhatsApp, the camera for a
 * photo answer) don't trigger a full re-read; live updates cover the rest.
 */
const MIN_INTERVAL_MS = 2 * 60_000;
/** Students' phones: live updates already bring new tests and results, so re-read less (data, battery). */
const STUDENT_INTERVAL_MS = 5 * 60_000;

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
    // Everything was just loaded at sign-in: the first window starts now.
    lastRun.current = Date.now();
    const gap = session.role === "student" ? STUDENT_INTERVAL_MS : MIN_INTERVAL_MS;

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      // Never mid-test: a full re-read there competes with photo uploads.
      if (/^\/test\//.test(window.location.pathname)) return;
      const now = Date.now();
      if (now - lastRun.current < gap) return;
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
