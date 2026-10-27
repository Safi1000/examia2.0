import { type NextRequest, NextResponse } from "next/server";
import { classChangeCopy } from "@/lib/notify-copy";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { notifyClassChange, pushReady, serviceClient } from "@/lib/push-server";
import {
  LEVEL_LABEL,
  addDays,
  applyDayChange,
  cleanSchedule,
  clock,
  DEFAULT_SCHEDULE,
  levelOf,
  pkDate,
  subjectOf,
  type DayChange,
  type Schedule,
} from "@/lib/timetable";
import { syncCalendar, syncCalendarDay } from "@/lib/class-automation";
import { loadSchedule, saveSchedule } from "@/lib/schedule-server";
import { studentsIn } from "@/lib/automation";

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
    | ({ op: "day"; notify?: boolean } & DayChange)
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
  if (body.op === "day") {
    await syncCalendar(sb, next, body).catch((e) => console.error("[schedule] calendar", e));
    if (body.notify && body.date >= today) await tellStudents(sb, body).catch((e) => console.error("[schedule] notify", e));
  } else {
    // Today's links may already exist: keep their Calendar times in step.
    await syncCalendarDay(sb, next, today).catch((e) => console.error("[schedule] calendar", e));
  }
  return NextResponse.json(next, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Hamza ticked "Tell students": a note in each affected student's bell, and a
 * phone notification (quiet hours apply). Nothing about who joined or not.
 */
async function tellStudents(sb: ReturnType<typeof serviceClient>, c: DayChange) {
  const [{ data: classes }, { data: subjects }] = await Promise.all([sb.from("classes").select("id,name"), sb.from("subjects").select("id,name")]);
  const classId = (classes ?? []).find((x) => levelOf(x) === c.level)?.id as string | undefined;
  const subjectId = (subjects ?? []).find((x) => subjectOf(x) === c.subject)?.id as string | undefined;
  if (!classId || !subjectId) return;
  const who = await studentsIn(sb, classId, [subjectId]);
  if (!who.length) return;
  const day =
    c.date === pkDate(Date.now())
      ? "today"
      : new Date(`${c.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "short" });
  const name = `${LEVEL_LABEL[c.level]} ${c.subject}`;
  const { title, body } = classChangeCopy(
    !c.change ? "back" : c.change.cancelled ? "cancelled" : c.change.extra ? "extra" : "moved",
    name,
    day,
    clock(c.change?.start ?? ""),
  );
  await sb.from("activities").insert(
    who.map((student_id) => ({ type: "announcement_posted", title, description: body, student_id, link: "/classes", audience: "student" })),
  );
  const ref = `change:${c.date}:${c.level}:${c.subject}:${c.change ? (c.change.cancelled ? "x" : (c.change.start ?? "")) : "back"}`;
  await notifyClassChange(sb, who, ref, title, body);
}
