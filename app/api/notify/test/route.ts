import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { notifyTest, pushReady } from "@/lib/push-server";

/** POST (Hamza only): one test notification to Hamza's own phones and the test account's. Never to students. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminId = await adminIdFromRequest(req);
  if (!adminId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ sent: 0, devices: 0, ready: false }, { status: 503 });
  try {
    return NextResponse.json(await notifyTest(adminId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[notify] test", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "could not send" }, { status: 502 });
  }
}
