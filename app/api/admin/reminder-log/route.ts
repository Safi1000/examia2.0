import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";

/**
 * Hamza only: the automatic phone reminders sent to one student in the last
 * 14 days, for the History on Today and Tell parents (components/admin/SentHistory.tsx).
 * notify_log is readable only with the service key, so it is read here and
 * only kind, ref and time go back. Never staff.
 *
 *   GET ?studentId=<id>   { items: [{ kind, ref, sentAt }] }, newest first
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const DAYS = 14;

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return bad("This isn't set up on the server yet.", 503);
  const studentId = req.nextUrl.searchParams.get("studentId") ?? "";
  if (!studentId || studentId.length > 80) return bad("bad request");
  try {
    const { data, error } = await serviceClient()
      .from("notify_log")
      .select("kind,ref,sent_at")
      .eq("student_id", studentId)
      .gte("sent_at", new Date(Date.now() - DAYS * 86_400_000).toISOString())
      .order("sent_at", { ascending: false })
      .limit(200);
    if (error) return bad("Couldn't load. Try again.", 502);
    const items = (data ?? []).map((r) => ({ kind: String(r.kind), ref: String(r.ref), sentAt: String(r.sent_at) }));
    return NextResponse.json({ items }, { headers: noStore });
  } catch {
    return bad("Couldn't load. Try again.", 502);
  }
}
