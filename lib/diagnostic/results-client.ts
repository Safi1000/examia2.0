"use client";

/**
 * Loading results and saving Hamza's report notes, from the browser.
 * In the local demo it uses example students and keeps notes on the device.
 */
import { DEMO } from "@/lib/demo";
import { demoResults } from "@/lib/diagnostic/demo";
import type { ResultPayload } from "@/lib/diagnostic/logic";
import type { ReportNotes } from "@/lib/diagnostic/student-report";
import { supabase } from "@/lib/supabase";

export type ResultRow = ResultPayload & { id: string; savedAt: string; notes?: ReportNotes | null };

const demoKey = (id: string) => `ht_demo_notes_${id}`;

async function token() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? "";
}

export async function loadResults(): Promise<{ rows: ResultRow[]; error?: string }> {
  if (DEMO) {
    return {
      rows: demoResults().map((r) => {
        let notes: ReportNotes | null = null;
        try {
          notes = JSON.parse(localStorage.getItem(demoKey(r.id)) ?? "null");
        } catch {}
        return { ...r, notes };
      }),
    };
  }
  const res = await fetch("/api/diagnostic/results", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as { results?: ResultRow[]; error?: string };
  if (!res.ok) return { rows: [], error: res.status === 403 ? "Sign in as the teacher to see results." : (j.error ?? "Couldn't load the results.") };
  return { rows: j.results ?? [] };
}

export async function saveNotes(id: string, notes: ReportNotes): Promise<boolean> {
  if (DEMO) {
    try {
      localStorage.setItem(demoKey(id), JSON.stringify(notes));
      return true;
    } catch {
      return false;
    }
  }
  const res = await fetch("/api/diagnostic/notes", {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, notes }),
  });
  return res.ok;
}

/** Day one and end of session belong to the same student when the names match. */
export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
