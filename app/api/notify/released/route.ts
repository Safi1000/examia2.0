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
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const sent = await notifyReleased((ids ?? []).filter((x) => typeof x === "string").slice(0, 200));
  return NextResponse.json({ sent });
}
