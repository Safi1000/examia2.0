import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DEFAULT_SCHEDULE, cleanSchedule, type Schedule } from "@/lib/timetable";

/**
 * Where Hamza's edited timetable lives: on his own admin account (server-only
 * app_metadata), so no database change was needed. Read by the timetable API
 * and the 15-minute timer. A short in-memory cache keeps reads cheap.
 */
let cache: { at: number; value: Schedule } | null = null;

/**
 * The admin account that holds the timetable and automation settings: the
 * one that already has a timetable, else the first admin.
 */
export async function adminUser(sb: SupabaseClient) {
  let first: User | null = null;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const admins = data.users.filter((u) => (u.app_metadata as { role?: string })?.role === "admin");
    const found = admins.find((u) => (u.app_metadata as { schedule?: unknown }).schedule);
    if (found) return found;
    first ??= admins[0] ?? null;
    if (data.users.length < 1000) break;
  }
  return first;
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

/** Merge keys into the admin's server-only settings (timetable, automations). */
export async function saveAdminMeta(sb: SupabaseClient, callerId: string | null, patch: Record<string, unknown>) {
  const adminId = (await adminUser(sb).catch(() => null))?.id ?? callerId;
  if (!adminId) throw new Error("no admin");
  const { data, error } = await sb.auth.admin.getUserById(adminId);
  if (error || !data.user) throw error ?? new Error("no admin");
  const { error: upErr } = await sb.auth.admin.updateUserById(adminId, { app_metadata: { ...data.user.app_metadata, ...patch } });
  if (upErr) throw upErr;
  return { ...data.user.app_metadata, ...patch } as Record<string, unknown>;
}

export async function saveSchedule(sb: SupabaseClient, callerId: string, schedule: Schedule) {
  // One home for the timetable: whichever admin already holds it, else the caller.
  await saveAdminMeta(sb, callerId, { schedule });
  cache = { at: Date.now(), value: schedule };
}
