import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { levelSubjectsByStudent, serviceClient } from "@/lib/push-server";
import { cleanLevels } from "@/lib/levels";

/**
 * Admin only: the subjects each student takes at each level, for students
 * taking two levels (AS and A2 together). Kept on the student's sign-in
 * account (see lib/levels.ts), which only the server can write.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ready()) return NextResponse.json({});
  const map = await levelSubjectsByStudent(serviceClient());
  return NextResponse.json(Object.fromEntries(map), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ready()) return NextResponse.json({ error: "not set up" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { studentId?: string; levels?: unknown } | null;
  const studentId = String(b?.studentId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const levels = cleanLevels(b?.levels);

  const sb = serviceClient();
  const { data: row } = await sb.from("students").select("user_id").eq("id", studentId).maybeSingle();
  const userId = row?.user_id as string | undefined;
  if (!userId) return NextResponse.json({ error: "no account" }, { status: 404 });
  const { data: got, error: readErr } = await sb.auth.admin.getUserById(userId);
  if (readErr || !got.user) return NextResponse.json({ error: "no account" }, { status: 404 });
  // Keep everything else on the account (the admin role, anything set later) as it is.
  const meta = { ...(got.user.app_metadata ?? {}) } as Record<string, unknown>;
  if (Object.keys(levels).length) meta.levels = levels;
  else delete meta.levels;
  const { error } = await sb.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (error) return NextResponse.json({ error: "could not save" }, { status: 500 });
  return NextResponse.json({ levels });
}
