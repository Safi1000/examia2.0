"use client";

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The teacher console's list of paused students (see app/api/admin/access).
 * A paused student signs in to a blank screen, gets no reminders, is not
 * marked absent, and is left out of Today's lists and the parent reminders
 * until resumed. Loaded once per visit; the Students page updates it on a
 * pause or resume. If the list can't be read, nobody counts as paused.
 */
let ids: Set<string> = new Set();
let started = false;
const listeners = new Set<() => void>();

export const isPausedId = (id: string) => ids.has(id);

export function setPausedIds(next: Set<string>) {
  ids = next;
  listeners.forEach((l) => l());
}

async function load() {
  try {
    const { data } = await supabase().auth.getSession();
    const res = await fetch("/api/admin/access", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    if (!res.ok) return;
    const out = (await res.json()) as { paused?: string[] };
    setPausedIds(new Set(out.paused ?? []));
  } catch {
    /* keep what we have */
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const empty = new Set<string>();

/** The paused students' ids; re-renders the screen when the list loads or changes. */
export function usePausedIds(): Set<string> {
  useEffect(() => {
    if (started) return;
    started = true;
    void load();
  }, []);
  return useSyncExternalStore(subscribe, () => ids, () => empty);
}
