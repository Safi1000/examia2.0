import type { SupabaseClient, User } from "@supabase/supabase-js";
import { allRows } from "@/lib/push-server";
import { isPauseReason, readFarewell, readLeft, type FarewellNote, type LeftMark, type PauseReason } from "@/lib/farewell-copy";

/** Every sign-in account (up to 10,000), read page by page. Throws when they can't be read. */
async function allUsers(sb: SupabaseClient, keep: (u: User) => boolean): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (keep(u)) out.push(u);
    if (data.users.length < 1000) break;
  }
  return out;
}

/** student id by sign-in user id, for the users given. Throws when the students can't be read. */
async function studentIdsByUser(sb: SupabaseClient, userIds: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!userIds.size) return out;
  const { data: rows, error } = await allRows((a, b) => sb.from("students").select("id,user_id").order("id").range(a, b));
  if (error) throw new Error(error.message);
  for (const r of (rows as Array<{ id: string; user_id: string | null }> | null) ?? []) if (r.user_id && userIds.has(r.user_id)) out.set(r.user_id, r.id);
  return out;
}

const meta = (u: User) => (u.app_metadata ?? {}) as Record<string, unknown>;
const isPausedUser = (u: User) => meta(u).paused === true && meta(u).role !== "admin";

/**
 * Server only: the ids of students whose access Hamza has paused (the mark is
 * app_metadata.paused on their sign-in account; see app/api/admin/access).
 * A student who has left is always paused too, so they are in here as well.
 * Throws when the accounts can't be read, so each caller decides what a
 * failed read means for it.
 */
export async function pausedStudentIds(sb: SupabaseClient): Promise<Set<string>> {
  const users = await allUsers(sb, isPausedUser);
  const byUser = await studentIdsByUser(sb, new Set(users.map((u) => u.id)));
  return new Set(byUser.values());
}

export type AccessMarks = {
  paused: Set<string>;
  reasons: Map<string, PauseReason>;
  left: Map<string, LeftMark & { farewell?: FarewellNote }>;
};

/**
 * Server only: everything Students needs about access in one read: who is
 * paused, why (when Hamza gave a reason), and who has left (with their
 * farewell note, if they sent one). Keyed by student id. Throws like above.
 */
export async function accessMarks(sb: SupabaseClient): Promise<AccessMarks> {
  const users = await allUsers(sb, (u) => isPausedUser(u) || (meta(u).role !== "admin" && !!readLeft(meta(u).left)));
  const byUser = await studentIdsByUser(sb, new Set(users.map((u) => u.id)));
  const out: AccessMarks = { paused: new Set(), reasons: new Map(), left: new Map() };
  for (const u of users) {
    const id = byUser.get(u.id);
    if (!id) continue;
    const m = meta(u);
    if (m.paused === true) out.paused.add(id);
    if (m.paused === true && isPauseReason(m.pause_reason)) out.reasons.set(id, m.pause_reason);
    const left = readLeft(m.left);
    if (left) {
      const farewell = readFarewell(m.farewell);
      out.left.set(id, farewell ? { ...left, farewell } : left);
    }
  }
  return out;
}
