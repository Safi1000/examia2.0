import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { allRows, pushReady, serviceClient } from "@/lib/push-server";

/** GET (admin only): which students have notifications on, on at least one device. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ ids: [], ready: false });
  // Paged: one read stops at 1,000 rows, and a student can have several devices.
  const sb = serviceClient();
  const { data, error } = await allRows((a, b) => sb.from("push_subscriptions").select("id,student_id").order("id").range(a, b));
  if (error) return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  return NextResponse.json({ ids: [...new Set((data ?? []).map((r) => r.student_id as string))], ready: true }, { headers: { "Cache-Control": "no-store" } });
}
