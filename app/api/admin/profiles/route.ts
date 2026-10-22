import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";

/**
 * Admin only: each student's own settings (avatar, targets, weekly goal,
 * study-timer stats), keyed by student id. They live on the students' sign-in
 * accounts, which only the server can read.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({});
  const sb = serviceClient();
  const { data: rows } = await sb.from("students").select("id,user_id");
  const byUser = new Map((rows ?? []).filter((r) => r.user_id).map((r) => [r.user_id as string, r.id as string]));
  const out: Record<string, unknown> = {};
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) {
      const id = byUser.get(u.id);
      const profile = (u.user_metadata as { profile?: unknown } | undefined)?.profile;
      if (id && profile) out[id] = profile;
    }
    if (data.users.length < 1000) break;
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}
