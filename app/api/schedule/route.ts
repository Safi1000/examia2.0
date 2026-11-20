import { type NextRequest, NextResponse, after } from "next/server";
import { classChangeCopy } from "@/lib/notify-copy";
import { staffWith } from "@/lib/admin-auth";
import { addStaffLine } from "@/lib/staff-log-server";
import { notifyClassChange, pushReady, serviceClient } from "@/lib/push-server";
import {
  LEVEL_LABEL,
  addDays,
  applyDayChange,
  cleanSchedule,
  clock,
  DEFAULT_SCHEDULE,
  jointLabel,
  levelOf,
  pkDate,
  subjectOf,
  type DayChange,
  type Schedule,
} from "@/lib/timetable";
import { syncCalendar, syncCalendarDay } from "@/lib/class-automation";
import { loadSchedule, loadScheduleForSave, saveSchedule } from "@/lib/schedule-server";
import { studentsIn } from "@/lib/automation";

/**
 * The class timetable. GET: anyone (it's only times). POST: Hamza saves an
 * edited timetable (weekly classes, class days, term start, one-off changes).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Calendar and student messages finish after the answer has gone back (see POST).
export const maxDuration = 60;

export async function GET() {
  const schedule = pushReady() ? await loadSchedule(serviceClient()) : DEFAULT_SCHEDULE;
  // Shared for 30 s at the edge, so a classroom opening at once is one lookup.
  return NextResponse.json(schedule, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } });
}

export async function POST(req: NextRequest) {
  // Hamza, or a staff member Hamza switched Classes on for.
  const who = await staffWith(req, "classes");
  if (!who) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const adminId = who.id;
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as
    | ({ op: "weekly" } & Pick<Schedule, "termStarts" | "days" | "slots">)
    | ({ op: "day"; notify?: boolean } & DayChange)
    | null;
  if (!body || typeof body !== "object" || (body.op !== "weekly" && body.op !== "day")) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const sb = serviceClient();
  // Always start from the latest saved timetable, never the browser's copy.
  // If it can't be read right now, stop: carrying on would save this change
  // on top of the built-in default and wipe the real timetable.
  let cur: Schedule;
  try {
    cur = await loadScheduleForSave(sb);
  } catch (e) {
    console.error("[schedule] load for save", e);
    return NextResponse.json({ error: "Couldn't load the timetable just now. Nothing was changed. Try again." }, { status: 503 });
  }
  const today = pkDate(Date.now());
  const next = cleanSchedule(
    body.op === "weekly"
      ? { ...cur, termStarts: body.termStarts, days: body.days, slots: body.slots, exceptions: cur.exceptions.filter((e) => e.date >= addDays(today, -7)) }
      : applyDayChange(cur, body, today),
  );
  if (!next) return NextResponse.json({ error: "That timetable has a mistake in it." }, { status: 400 });
  try {
    await saveSchedule(sb, adminId, next);
  } catch (e) {
    console.error("[schedule] save", e);
    return NextResponse.json({ error: "Couldn't save the timetable. Try again." }, { status: 502 });
  }
  // The timetable is saved: answer now. Hamza's Calendar and the students'
  // messages follow in the background, so the page never sits on "Saving".
  // Calendar reads the latest timetable again, since several changes made one
  // after another (a joint class) finish in any order.
  after(async () => {
    if (who.ta) await addStaffLine(sb, who.name || "Staff", body.op === "day" ? `changed the ${body.level} ${body.subject} class on ${body.date}${body.notify ? " and told students" : ""}` : "changed the weekly timetable");
    if (body.op === "day") {
      if (body.notify && body.date >= today) await tellStudents(sb, body).catch((e) => console.error("[schedule] notify", e));
      await syncCalendar(sb, await loadSchedule(sb, true).catch(() => next), body).catch((e) => console.error("[schedule] calendar", e));
    } else {
      // Today's links may already exist: keep their Calendar times in step.
      await syncCalendarDay(sb, next, today).catch((e) => console.error("[schedule] calendar", e));
    }
  });
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
  const joint = c.change && !c.change.cancelled ? c.change.joint : undefined;
  const name = `${joint ? jointLabel(c.level, joint.level) : LEVEL_LABEL[c.level]} ${c.subject}`;
  const { title, body } = classChangeCopy(
    !c.change ? "back" : c.change.cancelled ? "cancelled" : joint ? "joint" : c.change.extra ? "extra" : "moved",
    name,
    day,
    clock(c.change?.start ?? ""),
    clock(c.change?.end ?? ""),
  );
  // A double tap (or a retry) sends the same change twice: if the newest class
  // note one of these students got in the last two minutes is this very note,
  // they have it already. Only the newest counts, so "cancelled, back,
  // cancelled" still tells them each time.
  const { data: last } = await sb
    .from("activities")
    .select("title,description")
    .eq("type", "announcement_posted")
    .eq("student_id", who.toSorted()[0])
    .eq("link", "/classes")
    .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (last?.[0] && last[0].title === title && last[0].description === body) return;
  await sb.from("activities").insert(
    who.map((student_id) => ({ type: "announcement_posted", title, description: body, student_id, link: "/classes", audience: "student" })),
  );
  const ref = `change:${c.date}:${c.level}:${c.subject}:${c.change ? (c.change.cancelled ? "x" : (c.change.start ?? "")) : "back"}`;
  await notifyClassChange(sb, who, ref, title, body);
}
