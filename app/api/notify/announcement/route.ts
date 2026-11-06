import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyAnnouncement, pushReady } from "@/lib/push-server";

/** Hamza chose to send a notice to phones too (quiet rules apply). Admin only. */
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
  const { id, cohortId, text } = (await req.json().catch(() => ({}))) as { id?: string; cohortId?: string | null; text?: string };
  if (typeof id !== "string" || typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const sent = await notifyAnnouncement(id, typeof cohortId === "string" ? cohortId : null, text.trim());
  return NextResponse.json({ sent });
}
