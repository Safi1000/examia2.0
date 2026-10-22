"use client";

import { Fragment, useEffect, useState } from "react";
import { DEMO } from "@/lib/demo";
import { cleanSchedule, getSchedule, setSchedule } from "@/lib/timetable";

const DEMO_KEY = "ht_demo_schedule";

/** Load the saved timetable (or the demo one) into the page. */
export async function fetchSchedule() {
  if (DEMO) {
    try {
      return cleanSchedule(JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null"));
    } catch {
      return null;
    }
  }
  const res = await fetch("/api/schedule", { cache: "no-store" });
  return res.ok ? cleanSchedule(await res.json()) : null;
}

/** Preview only: keep an edited timetable in this browser. */
export function saveDemoSchedule(v: unknown) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(v));
  } catch {}
}

/**
 * Wraps the portal: shows pages straight away with the last known timetable,
 * then swaps in Hamza's saved one if it differs (one quiet re-render).
 */
export function ScheduleGate({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void fetchSchedule()
      .then((s) => {
        if (!alive || !s || JSON.stringify(s) === JSON.stringify(getSchedule())) return;
        setSchedule(s);
        setVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return <Fragment key={version}>{children}</Fragment>;
}

/** Hamza saves the timetable. Returns the saved copy, or throws with a message. */
export async function storeSchedule(next: unknown) {
  const clean = cleanSchedule(next);
  if (!clean) throw new Error("That timetable has a mistake in it.");
  if (DEMO) {
    saveDemoSchedule(clean);
  } else {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase().auth.getSession();
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save. Try again.");
  }
  setSchedule(clean);
  return clean;
}
