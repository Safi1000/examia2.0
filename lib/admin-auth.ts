import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

/** True when the request carries a signed-in admin's Supabase token. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  return !!(await adminIdFromRequest(req));
}

/** The signed-in admin's user id, or null. */
export async function adminIdFromRequest(req: Request): Promise<string | null> {
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
    return (data.user?.app_metadata as { role?: string } | undefined)?.role === "admin" ? data.user!.id : null;
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
