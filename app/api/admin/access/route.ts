import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest, staffWith } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";
import { pausedStudentIds } from "@/lib/paused-server";

/**
 * Pausing a student's access.
 *
 * A paused student can still sign in, but the portal shows them a blank
 * screen until Hamza resumes them (see lib/access-paused.ts and the student
 * layout). While paused they get no phone notifications (lib/push-server.ts),
 * are never marked absent automatically (lib/automation.ts), and are left out
 * of "Mark the rest", Today's lists and the parent reminders (lib/paused.ts).
 * Nothing of theirs is deleted or changed.
 *
 *   GET                              staff: the ids of the paused students
 *   POST { ids: string[], paused }   Hamza only: pause or resume those students
 *
 * The mark lives on the student's sign-in account (app_metadata.paused), which
 * only the server can write, so a student cannot lift it. No database change.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

export async function GET(req: NextRequest) {
  // Hamza, or staff whose part of the console lists students. Not someone who may only read notes.
  if (!(await staffWith(req, "students", "marking", "homework", "tests", "attendance", "classes", "analytics"))) return bad("forbidden", 403);
  if (!ready()) return NextResponse.json({ paused: [] }, { headers: noStore });
  const sb = serviceClient();
  try {
    return NextResponse.json({ paused: [...(await pausedStudentIds(sb))] }, { headers: noStore });
  } catch {
    return bad("Couldn't load. Try again.", 502);
  }
}

export async function POST(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!ready()) return bad("This isn't set up on the server yet.", 503);
  const b = (await req.json().catch(() => null)) as { ids?: unknown; paused?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? b.ids.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 80).slice(0, 500) : [];
  if (!ids.length || typeof b?.paused !== "boolean") return bad("bad request");
  const paused = b.paused;
  const sb = serviceClient();
  const { data: rows, error } = await sb.from("students").select("id,user_id").in("id", ids);
  if (error) return bad("Couldn't change that. Try again.", 502);
  const userOf = new Map((rows ?? []).map((r) => [r.id as string, (r.user_id as string | null) ?? null]));

  const done: string[] = [];
  const failed: Array<{ id: string; why: string }> = [];
  for (const id of ids) {
    const userId = userOf.get(id);
    if (!userId) {
      failed.push({ id, why: "no login yet" });
      continue;
    }
    const { data: got } = await sb.auth.admin.getUserById(userId);
    const meta = (got.user?.app_metadata ?? null) as Record<string, unknown> | null;
    // Never a teacher's or an assistant's account.
    if (!got.user || meta?.role === "admin") {
      failed.push({ id, why: "not a student login" });
      continue;
    }
    const { error: saveError } = await sb.auth.admin.updateUserById(userId, { app_metadata: { ...(meta ?? {}), paused } });
    if (saveError) failed.push({ id, why: "the save failed" });
    else done.push(id);
  }
  return NextResponse.json({ ok: failed.length === 0, done, failed }, { headers: noStore });
}
