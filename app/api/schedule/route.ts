import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";
import { addDays, applyDayChange, cleanSchedule, DEFAULT_SCHEDULE, pkDate, type DayChange, type Schedule } from "@/lib/timetable";
import { syncCalendar } from "@/lib/class-automation";
import { loadSchedule, saveSchedule } from "@/lib/schedule-server";

/**
 * The class timetable. GET: anyone (it's only times). POST: Hamza saves an
 * edited timetable (weekly classes, class days, term start, one-off changes).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const schedule = pushReady() ? await loadSchedule(serviceClient()) : DEFAULT_SCHEDULE;
  // Shared for 30 s at the edge, so a classroom opening at once is one lookup.
  return NextResponse.json(schedule, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
}

export async function POST(req: NextRequest) {
  const adminId = await adminIdFromRequest(req);
  if (!adminId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as
    | ({ op: "weekly" } & Pick<Schedule, "termStarts" | "days" | "slots">)
    | ({ op: "day" } & DayChange)
    | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const sb = serviceClient();
  // Always start from the latest saved timetable, never the browser's copy.
  const cur = await loadSchedule(sb, true);
  const today = pkDate(Date.now());
  const next = cleanSchedule(
    body.op === "weekly"
      ? { ...cur, termStarts: body.termStarts, days: body.days, slots: body.slots, exceptions: cur.exceptions.filter((e) => e.date >= addDays(today, -7)) }
      : applyDayChange(cur, body, today),
  );
  if (!next) return NextResponse.json({ error: "That timetable has a mistake in it." }, { status: 400 });
  await saveSchedule(sb, adminId, next);
  if (body.op === "day") await syncCalendar(sb, next, body).catch((e) => console.error("[schedule] calendar", e));
  return NextResponse.json(next, { headers: { "Cache-Control": "no-store" } });
}
