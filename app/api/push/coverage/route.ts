import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";

/** GET (admin only): which students have notifications on, on at least one device. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ ids: [], ready: false });
  const { data, error } = await serviceClient().from("push_subscriptions").select("student_id");
  if (error) return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  return NextResponse.json({ ids: [...new Set((data ?? []).map((r) => r.student_id as string))], ready: true }, { headers: { "Cache-Control": "no-store" } });
}
