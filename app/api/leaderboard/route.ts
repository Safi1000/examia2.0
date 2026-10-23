import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushReady, serviceClient } from "@/lib/push-server";
import { currentStats, levelFor } from "@/lib/focus";
import { displayName } from "@/lib/display-name";
import type { Profile } from "@/lib/profile";

/**
 * This week's top 3 study hours in the signed-in student's cohort: first
 * names and hours only (never marks). Cached for 5 minutes per cohort.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEEK_MIN = 70 * 60; // anything above this isn't real study time
const cache = new Map<string, { at: number; rows: Array<{ id: string; name: string; avatar?: string; minutes: number; level: number }> }>();

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !pushReady()) return NextResponse.json({ top: [], me: null });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who } = await anon.auth.getUser();
  if (!who.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = serviceClient();
  const { data: me } = await sb.from("students").select("id,cohort_id").eq("user_id", who.user.id).maybeSingle();
  if (!me?.cohort_id) return NextResponse.json({ top: [], me: null });

  let entry = cache.get(me.cohort_id);
  if (!entry || Date.now() - entry.at > 5 * 60_000) {
    const { data: mates } = await sb.from("students").select("id,user_id,username").eq("cohort_id", me.cohort_id);
    const byUser = new Map((mates ?? []).filter((m) => m.user_id).map((m) => [m.user_id as string, m]));
    const rows: Array<{ id: string; name: string; avatar?: string; minutes: number; level: number }> = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      for (const u of data.users) {
        const m = byUser.get(u.id);
        const p = (u.user_metadata as { profile?: Profile } | undefined)?.profile;
        if (!m || !p?.focus) continue;
        // Students can edit their own saved stats, so only believe what adds up:
        // this week's days (at most 16 h a day), never more than the week total.
        const st = currentStats(p.focus, Date.now());
        const fromDays = Object.entries(st.days ?? {})
          .filter(([d]) => d >= (st.weekOf ?? ""))
          .reduce((n, [, m]) => n + Math.min(960, Math.max(0, Number(m) || 0)), 0);
        const minutes = Math.round(Math.min(MAX_WEEK_MIN, Math.max(0, Number(st.weekMinutes) || 0), fromDays));
        const level = levelFor(Math.min(6000 * 60, Math.max(0, Number(st.totalMinutes) || 0))).index;
        if (minutes > 0) rows.push({ id: m.id as string, name: displayName(m.username as string).split(" ")[0], avatar: p.avatar, minutes, level });
      }
      if (data.users.length < 1000) break;
    }
    rows.sort((a, b) => b.minutes - a.minutes);
    entry = { at: Date.now(), rows };
    cache.set(me.cohort_id, entry);
  }
  const rank = entry.rows.findIndex((r) => r.id === me.id);
  return NextResponse.json(
    {
      top: entry.rows.slice(0, 3).map(({ name, avatar, minutes, level }) => ({ name, avatar, minutes, level })),
      me: rank >= 0 ? { rank: rank + 1, minutes: entry.rows[rank].minutes } : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
