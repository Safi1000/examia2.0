import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SCHEDULE, cleanSchedule, type Schedule } from "@/lib/timetable";

/**
 * Where Hamza's edited timetable lives: on his own admin account (server-only
 * app_metadata), so no database change was needed. Read by the timetable API
 * and the 15-minute timer. A short in-memory cache keeps reads cheap.
 */
let cache: { at: number; value: Schedule } | null = null;

async function adminUser(sb: SupabaseClient) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => (u.app_metadata as { role?: string })?.role === "admin" && (u.app_metadata as { schedule?: unknown }).schedule);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function loadSchedule(sb: SupabaseClient, fresh = false): Promise<Schedule> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const u = await adminUser(sb);
    const value = cleanSchedule((u?.app_metadata as { schedule?: unknown } | undefined)?.schedule) ?? DEFAULT_SCHEDULE;
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[schedule] load", e);
    return cache?.value ?? DEFAULT_SCHEDULE;
  }
}

export async function saveSchedule(sb: SupabaseClient, adminId: string, schedule: Schedule) {
  const { data, error } = await sb.auth.admin.getUserById(adminId);
  if (error || !data.user) throw error ?? new Error("no admin");
  const { error: upErr } = await sb.auth.admin.updateUserById(adminId, { app_metadata: { ...data.user.app_metadata, schedule } });
  if (upErr) throw upErr;
  cache = { at: Date.now(), value: schedule };
}
