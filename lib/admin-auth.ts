import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { STAFF_AREAS, cleanAccess, type StaffArea } from "@/lib/staff-areas";

/**
 * Two kinds of staff sign in to the console: Hamza (the owner) and, since
 * Nov 2026, a teaching assistant. Both carry role "admin" on their account
 * (the database only knows that one word); the assistant also carries
 * staff: "ta". Everything here is owner only unless it says "staff".
 *
 * This is a guard rail in the site's own routes and screens, not a lock in
 * the database: see DEVELOPER-LIST.md, item 4, for the real role.
 */
export type Staff = { id: string; ta: boolean; name: string; /** The parts switched on for them, read fresh on every request. Hamza has them all. */ access: StaffArea[] };

/** True when the request carries Hamza's own sign-in (never the assistant's). */
export async function isAdminRequest(req: Request): Promise<boolean> {
  return !!(await adminIdFromRequest(req));
}

/** Hamza's user id when the request carries his own sign-in, or null (also for the assistant). */
export async function adminIdFromRequest(req: Request): Promise<string | null> {
  const s = await staffFromRequest(req);
  return s && !s.ta ? s.id : null;
}

/** True for Hamza or any staff member: the few things staff may read. */
export async function isStaffRequest(req: Request): Promise<boolean> {
  return !!(await staffFromRequest(req));
}

/**
 * Hamza, or a staff member who has this part of the console switched on
 * (any one of the parts given). Null for everyone else.
 */
export async function staffWith(req: Request, ...areas: StaffArea[]): Promise<Staff | null> {
  const s = await staffFromRequest(req);
  return s && (!s.ta || areas.some((a) => s.access.includes(a))) ? s : null;
}

/** Whoever of the staff is signed in on this request, or null. */
export async function staffFromRequest(req: Request): Promise<Staff | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // A server that isn't set up answers "not allowed", never a crash page.
  if (!token || !url || !key) return null;
  try {
    const sb = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      // One request, one check: nothing to remember or renew on the server.
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Asked of Supabase itself, so a made-up or expired token never passes.
    const { data } = await sb.auth.getUser();
    const meta = data.user?.app_metadata as { role?: string; staff?: string; name?: string; access?: unknown } | undefined;
    if (!data.user || meta?.role !== "admin") return null;
    const ta = meta.staff === "ta";
    // Paused by Hamza: their sign-in pass may still be alive for a while, but the site's own routes stop now.
    const until = (data.user as { banned_until?: string | null }).banned_until;
    if (ta && until && +new Date(until) > Date.now()) return null;
    return { id: data.user.id, ta, name: typeof meta.name === "string" ? meta.name.slice(0, 60) : "", access: ta ? cleanAccess(meta.access) : STAFF_AREAS.map((a) => a.key) };
  } catch {
    return null;
  }
}

/**
 * True when a timer call carries `Authorization: Bearer <CRON_SECRET>`.
 * Both sides are hashed first, so the comparison takes the same time whatever
 * was sent and a guess can't be improved one letter at a time.
 */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization");
  if (!secret || !given) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}
