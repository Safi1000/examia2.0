"use client";

import { useEffect, useState } from "react";
import { DEMO } from "@/lib/demo";
import { supabase } from "@/lib/supabase";

/**
 * Hamza only (Today): the students with phone reminders on, on at least one
 * device. The automatic nudges reach nobody else, so Today marks the rest
 * "No phone reminders". Null while loading, or when it can't be read (then no
 * row is marked, rather than every row).
 */
export function usePushDevices(demoIds: string[]): Set<string> | null {
  const [on, setOn] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (DEMO) {
          // The preview's example matches the Class reminders card: the first two students have them on.
          if (alive) setOn(new Set(demoIds.slice(0, 2)));
          return;
        }
        const { data } = await supabase().auth.getSession();
        const res = await fetch("/api/push/coverage", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ids?: string[]; ready?: boolean };
        if (alive && res.ok && j.ready !== false && Array.isArray(j.ids)) setOn(new Set(j.ids));
      } catch {}
    })();
    return () => {
      alive = false;
    };
    // Read once per visit: the demo list only seeds the preview's example.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return on;
}
