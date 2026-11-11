"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useDatabase } from "@/lib/data/store";
import type { Database } from "@/lib/data/seed";
import type { Profile } from "@/lib/profile";
import { addDays, pkDate, slotKey, slotsForStudent } from "@/lib/timetable";
import { mondayOf } from "@/lib/focus";

/** Admin: every student's own settings (targets, goal, study stats), by student id. */
export function useStudentProfiles(): Record<string, Profile> {
  const db = useDatabase();
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  // Preview only: believable study stats and opened recordings, so the teacher pages show something real.
  const demo = useMemo(() => (DEMO ? demoProfiles(db) : null), [db]);
  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase().auth.getSession();
      const res = await fetch("/api/admin/profiles", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (alive && res.ok) setProfiles((await res.json()) as Record<string, Profile>);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return demo ?? profiles;
}

/**
 * Preview only, the same every load: Groundwork minutes for the last month
 * (every fifth student has gone quiet for over a week, every seventh never
 * started) and the recordings each student opened in the last week.
 */
function demoProfiles(db: Database): Record<string, Profile> {
  const nowMs = Date.now();
  const today = pkDate(nowMs);
  const monday = mondayOf(today);
  const out: Record<string, Profile> = {};
  db.students.forEach((st, i) => {
    let seed = 11 + i * 97;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const never = i % 7 === 6;
    const quietFor = i % 5 === 3 ? 9 : 0;
    const keen = [0.85, 0.55, 0.35, 0.6, 0.7][i % 5];
    const days: Record<string, number> = {};
    if (!never)
      for (let back = 30; back >= quietFor; back--) {
        if (rnd() > keen) continue;
        days[addDays(today, -back)] = 20 + Math.round(rnd() * 80);
      }
    const dates = Object.keys(days).sort();
    const weekMinutes = dates.filter((d) => d >= monday).reduce((n, d) => n + days[d], 0);
    let streak = 0;
    for (let d = days[today] ? today : addDays(today, -1); days[d]; d = addDays(d, -1)) streak++;
    const watched: string[] = [];
    for (let back = 7; back >= 0; back--) {
      for (const sl of slotsForStudent(db, st, addDays(today, -back))) if ((i + back + sl.subject.length) % 3 === 0) watched.push(slotKey(sl));
    }
    out[st.id] = {
      onboarded: true,
      focus: {
        streak,
        lastDay: dates[dates.length - 1] ?? null,
        weekOf: monday,
        weekMinutes,
        bySubject: {},
        totalMinutes: dates.reduce((n, d) => n + days[d], 0),
        days,
      },
      watched,
    };
  });
  return out;
}
