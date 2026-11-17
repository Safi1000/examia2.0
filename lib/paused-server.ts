import type { SupabaseClient } from "@supabase/supabase-js";
import { allRows } from "@/lib/push-server";

/**
 * Server only: the ids of students whose access Hamza has paused (the mark is
 * app_metadata.paused on their sign-in account; see app/api/admin/access).
 * Throws when the accounts can't be read, so each caller decides what a
 * failed read means for it.
 */
export async function pausedStudentIds(sb: SupabaseClient): Promise<Set<string>> {
  const pausedUsers = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if ((u.app_metadata as { paused?: unknown } | undefined)?.paused === true) pausedUsers.add(u.id);
    if (data.users.length < 1000) break;
  }
  const out = new Set<string>();
  if (!pausedUsers.size) return out;
  const { data: rows, error } = await allRows((a, b) => sb.from("students").select("id,user_id").order("id").range(a, b));
  if (error) throw new Error(error.message);
  for (const r of (rows as Array<{ id: string; user_id: string | null }> | null) ?? []) if (r.user_id && pausedUsers.has(r.user_id)) out.add(r.id);
  return out;
}
