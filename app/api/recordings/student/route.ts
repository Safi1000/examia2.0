import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";
import { readAccess } from "@/lib/recordings-server";
import { noAccess, splitKey, viewOf } from "@/lib/recording-access";

/**
 * GET (a signed-in, current student): whether a catch-up window is open and
 * until when, and which single recordings Hamza opened or closed by hand, for
 * that student's own levels only. Never any links: the list itself comes from
 * class_links, which a student can read only for their own levels.
 *
 * Refused (403) for anyone who isn't a current student: no student record
 * (removed), or a switched-off cohort (a past student).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  // A server that isn't set up can't check who is asking: it answers "not allowed".
  if (!ready()) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  let userId: string | null = null;
  try {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await anon.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {}
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });

  const sb = serviceClient();
  const { data: st } = await sb.from("students").select("id,cohort_id").eq("user_id", userId).maybeSingle();
  if (!st?.id) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (st.cohort_id) {
    const { data: cohort } = await sb.from("cohorts").select("active").eq("id", st.cohort_id).maybeSingle();
    if (cohort && cohort.active === false) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  // Their levels: their own, or their cohort's when none are set (the same rule as the database's student_in_level).
  const { data: own } = await sb.from("student_classes").select("class_id").eq("student_id", st.id);
  let levels = (own ?? []).map((r) => r.class_id as string);
  if (!levels.length && st.cohort_id) {
    const { data: cc } = await sb.from("cohort_classes").select("class_id").eq("cohort_id", st.cohort_id);
    levels = (cc ?? []).map((r) => r.class_id as string);
  }
  const mine = new Set(levels);

  try {
    const v = viewOf(await readAccess(sb), Date.now());
    const keep = (k: string) => mine.has(splitKey(k).classId);
    return NextResponse.json(
      {
        catchUpUntil: v.catchUpUntil,
        upTo: v.upTo,
        overrides: Object.fromEntries(Object.entries(v.overrides).filter(([k]) => keep(k))),
        hidden: v.hidden.filter(keep),
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json(noAccess, { headers: noStore });
  }
}
