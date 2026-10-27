"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { DEFAULT_SCHEDULE, getSchedule, slotKey, subscribeSchedule, type DaySlot, type Schedule } from "@/lib/timetable";

export * from "@/lib/timetable";

/**
 * Live classes. The weekly timetable is fixed and lives in lib/timetable.ts (change a time
 * here, no database needed). Each day Hamza pastes a Meet link per class in
 * Admin → Classes; students see a Join button from 5 minutes before the start.
 * Join taps fill attendance automatically (see join_class() in the migration).
 */

export interface ClassLink {
  date: string;
  classId: string;
  subjectId: string;
  meetUrl: string | null;
  recordingUrl: string | null;
}
export interface ClassJoin {
  studentId: string;
  date: string;
  classId: string;
  subjectId: string;
  joinedAt: string;
}

// ---- Demo (preview only): kept in this browser ----------------------------
const DEMO_KEY = "ht_demo_class_links";
function demoLinks(): ClassLink[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]") as ClassLink[];
  } catch {
    return [];
  }
}

/**
 * Links (and, for Hamza, joins) between two dates. Refreshes every minute and
 * when the tab comes back. `ready` is false when the database update hasn't
 * been applied yet, so pages can say so instead of looking broken.
 */
/** `poll`: check every minute (only worth it around class time). */
export function useClassLinks(from: string, to: string, withJoins = false, poll = true) {
  const [links, setLinks] = useState<ClassLink[]>([]);
  const [joins, setJoins] = useState<ClassJoin[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (DEMO) {
      setLinks(demoLinks().filter((l) => l.date >= from && l.date <= to));
      setReady(true);
      return;
    }
    const sb = supabase();
    const [l, j] = await Promise.all([
      sb.from("class_links").select("*").gte("on_date", from).lte("on_date", to),
      withJoins ? sb.from("class_joins").select("*").gte("on_date", from).lte("on_date", to) : Promise.resolve({ data: [], error: null }),
    ]);
    if (l.error) {
      setReady(false);
      return;
    }
    setReady(true);
    setLinks(
      (l.data ?? []).map((r) => ({
        date: r.on_date as string,
        classId: r.class_id as string,
        subjectId: r.subject_id as string,
        meetUrl: (r.meet_url as string) ?? null,
        recordingUrl: (r.recording_url as string) ?? null,
      })),
    );
    setJoins(
      ((j.data as Record<string, unknown>[]) ?? []).map((r) => ({
        studentId: r.student_id as string,
        date: r.on_date as string,
        classId: r.class_id as string,
        subjectId: r.subject_id as string,
        joinedAt: r.joined_at as string,
      })),
    );
  }, [from, to, withJoins]);

  useEffect(() => {
    // Initial fetch plus a gentle refresh; the effect owns the subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = poll ? setInterval(() => void load(), 60_000) : undefined;
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (t) clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, poll]);

  /** Hamza: save a Meet or recording link (blank clears it). */
  const save = useCallback(
    async (slots: Array<{ date: string; classId: string; subjectId: string }>, field: "meetUrl" | "recordingUrl", value: string | null) => {
      const v = value?.trim() || null;
      const next = (prev: ClassLink[]) => {
        const out = [...prev];
        for (const s of slots) {
          const i = out.findIndex((l) => slotKey(l) === slotKey(s));
          const base = i >= 0 ? out[i] : { ...s, meetUrl: null, recordingUrl: null };
          const row = { ...base, [field]: v };
          if (i >= 0) out[i] = row;
          else out.push(row);
        }
        return out;
      };
      setLinks(next);
      if (DEMO) {
        try {
          localStorage.setItem(DEMO_KEY, JSON.stringify(next(demoLinks())));
        } catch {}
        return true;
      }
      const col = field === "meetUrl" ? "meet_url" : "recording_url";
      const { error } = await supabase()
        .from("class_links")
        .upsert(
          slots.map((s) => ({ on_date: s.date, class_id: s.classId, subject_id: s.subjectId, [col]: v, updated_at: new Date().toISOString() })),
          { onConflict: "on_date,class_id,subject_id" },
        );
      if (error) {
        void load();
        return false;
      }
      return true;
    },
    [load],
  );

  return { links, joins, ready, save, reload: load };
}

/** Student taps Join: records attendance, then returns the Meet link to open. */
export async function joinClass(slot: DaySlot, fallbackUrl: string | null): Promise<string | null> {
  if (DEMO) return fallbackUrl;
  const { data, error } = await supabase().rpc("join_class", { p_class: slot.classId, p_subject: slot.subjectId });
  if (error) return fallbackUrl;
  return (data as string | null) ?? fallbackUrl;
}


/** The timetable in use; components re-render when Hamza's saved one arrives or changes. */
export function useSchedule(): Schedule {
  return useSyncExternalStore(subscribeSchedule, getSchedule, () => DEFAULT_SCHEDULE);
}
