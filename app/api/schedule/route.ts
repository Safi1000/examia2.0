import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";
import { cleanSchedule, DEFAULT_SCHEDULE } from "@/lib/timetable";
import { loadSchedule, saveSchedule } from "@/lib/schedule-server";

/**
 * The class timetable. GET: anyone (it's only times). POST: Hamza saves an
 * edited timetable (weekly classes, class days, term start, one-off changes).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const schedule = pushReady() ? await loadSchedule(serviceClient()) : DEFAULT_SCHEDULE;
  return NextResponse.json(schedule, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}

export async function POST(req: NextRequest) {
  const adminId = await adminIdFromRequest(req);
  if (!adminId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const schedule = cleanSchedule(await req.json().catch(() => null));
  if (!schedule) return NextResponse.json({ error: "That timetable has a mistake in it." }, { status: 400 });
  await saveSchedule(serviceClient(), adminId, schedule);
  return NextResponse.json(schedule);
}
