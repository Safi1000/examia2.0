"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import type { Profile } from "@/lib/profile";

/** Admin: every student's own settings (targets, goal, study stats), by student id. */
export function useStudentProfiles(): Record<string, Profile> {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
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
  return profiles;
}
