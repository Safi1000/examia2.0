"use client";

import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import type { Session } from "@/types";

/**
 * What the teaching assistant sees in the console. Hamza chose (Nov 2026):
 * she marks every test and releases results, replies to homework, looks up
 * students (no phone numbers, no changes to accounts) and sees activity.
 * Everything else is his alone.
 *
 * A guard rail, not a lock: the screens and the site's own server routes hold
 * her to this, but the database still sees her as staff. DEVELOPER-LIST.md,
 * item 4, is the real role.
 */
export const isTa = (session: Session | null | undefined) => session?.role === "admin" && session.staff === "ta";

/** Console pages she may open (and anything under them). */
const TA_PAGES = ["/admin/submissions", "/admin/grading", "/admin/assignments", "/admin/roster", "/admin/activity", "/admin/notifications"];
export const TA_HOME = "/admin/submissions";
export const taMayOpen = (pathname: string) => TA_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * A line in the staff log ("released Amelia's Forces test"). Sent only for the
 * assistant, never awaited, never shown to students. Failing quietly is fine:
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
