import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Two kinds of staff sign in to the console: Hamza (the owner) and, since
 * Nov 2026, a teaching assistant. Both carry role "admin" on their account
 * (the database only knows that one word); the assistant also carries
 * staff: "ta". Everything here is owner only unless it says "staff".
 *
 * This is a guard rail in the site's own routes and screens, not a lock in
 * the database: see DEVELOPER-LIST.md, item 4, for the real role.
 */
export type Staff = { id: string; ta: boolean; name: string };

/** True when the request carries Hamza's own sign-in (never the assistant's). */
export async function isAdminRequest(req: Request): Promise<boolean> {
  return !!(await adminIdFromRequest(req));
}

/** Hamza's user id when the request carries his own sign-in, or null (also for the assistant). */
export async function adminIdFromRequest(req: Request): Promise<string | null> {
  const s = await staffFromRequest(req);
  return s && !s.ta ? s.id : null;
}

/** True for Hamza or the assistant: the few things she may read. */
export async function isStaffRequest(req: Request): Promise<boolean> {
  return !!(await staffFromRequest(req));
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
    const meta = data.user?.app_metadata as { role?: string; staff?: string; name?: string } | undefined;
    if (!data.user || meta?.role !== "admin") return null;
    return { id: data.user.id, ta: meta.staff === "ta", name: typeof meta.name === "string" ? meta.name.slice(0, 60) : "" };
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
