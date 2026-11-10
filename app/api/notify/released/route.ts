import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyReleased, pushReady } from "@/lib/push-server";

/** Hamza just released results: tell those students (quiet rules apply). Admin only. */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!pushReady()) return NextResponse.json({ sent: 0, ready: false });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await sb.auth.getUser();
  if ((data.user?.app_metadata as { role?: string } | undefined)?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { ids } = ((await req.json().catch(() => null)) ?? {}) as { ids?: unknown };
  // Paper ids only: anything else would make the lookup fail for the whole batch.
  const clean = (Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  try {
    return NextResponse.json({ sent: await notifyReleased(clean) });
  } catch (e) {
    // Not lost: the 15-minute check sends any result that hasn't gone out yet.
    console.error("[notify] released", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "could not send" }, { status: 502 });
  }
}
