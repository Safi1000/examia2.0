"use client";

import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import type { Session } from "@/types";
import { STAFF_AREAS, staffAllowed } from "@/lib/staff-areas";
import { useAuth } from "@/lib/auth-context";

export { STAFF_AREAS, DEFAULT_ACCESS, cleanAccess, type StaffArea } from "@/lib/staff-areas";

/**
 * Staff (a teaching assistant, or anyone Hamza gives a sign-in): role "admin"
 * plus staff "ta", and the parts of the console Hamza switched on for them in
 * Settings (lib/staff-areas.ts). Student activity, phone numbers, account
 * changes, settings, cohorts and export are never theirs.
 *
 * A guard rail, not a lock: the screens and the site's own server routes hold
 * them to this, but the database still sees them as staff. DEVELOPER-LIST.md,
 * item 4, is the real role.
 */
export const isTa = (session: Session | null | undefined) => session?.role === "admin" && session.staff === "ta";

/**
 * True on a staff member's console (not Hamza's). Use this, not only the
 * owner-only mark, wherever something must not open or run for staff: an
 * address typed by hand, a window, an action.
 */
export const useIsStaff = () => isTa(useAuth().session);

/** Pages every staff member may open, whatever is switched on. */
const ALWAYS = ["/admin/notifications"];

/** May this staff member open this console page (or anything under it)? */
export function taMayOpen(pathname: string, session?: Session | null) {
  const pages = [...ALWAYS, ...staffAllowed(session?.staffAccess).flatMap((k) => STAFF_AREAS.find((a) => a.key === k)?.pages ?? [])];
  return pages.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where a staff member lands: the first part switched on for them. */
export function taHome(session?: Session | null) {
  const first = staffAllowed(session?.staffAccess)[0];
  return STAFF_AREAS.find((a) => a.key === first)?.pages[0] ?? ALWAYS[0];
}

/**
 * A line in the staff log ("released Amelia's Forces test"). Sent only for
 * staff, never awaited, never shown to students. Failing quietly is fine:
 * the log is a help for Hamza, not part of the action.
 */
export function staffLog(session: Session | null | undefined, what: string) {
  if (DEMO || !isTa(session)) return;
  void supabase()
    .auth.getSession()
    .then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      return fetch("/api/admin/staff", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ what }), keepalive: true });
    })
    .catch(() => {});
}
