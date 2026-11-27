import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";
import { verifyFarewellToken } from "@/lib/farewell-server";
import { displayName } from "@/lib/display-name";
import { FAREWELL_TEXT_MAX, isRating, readLeft, type FarewellNote } from "@/lib/farewell-copy";

/**
 * A leaving student's feedback note to Hamza (public; see app/farewell and
 * app/api/admin/access).
 *
 *   GET  ?t=<token>                         → { name, kind, sent }, 404 if the link is bad or they haven't left
 *   POST { t, rating, helped, change }      → saves the note (the latest one wins)
 *   POST with the student's own sign-in (Authorization: Bearer) instead of t
 *
 * The note is kept on the student's sign-in account (app_metadata.farewell),
 * which only the server writes. Only for students who have left.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const notFound = () => bad("not found", 404);
const BODY_MAX = 12_000;

type Sb = ReturnType<typeof serviceClient>;

/** The sign-in account behind a student id, when it is a student's who has left. */
async function leftUser(sb: Sb, studentId: string): Promise<User | null> {
  const { data: row, error } = await sb.from("students").select("user_id").eq("id", studentId).maybeSingle();
  if (error || !row?.user_id) return null;
  const { data } = await sb.auth.admin.getUserById(row.user_id as string);
  const meta = (data.user?.app_metadata ?? {}) as Record<string, unknown>;
  if (!data.user || meta.role === "admin" || !readLeft(meta.left)) return null;
  return data.user;
}

export async function GET(req: NextRequest) {
  if (!ready()) return notFound();
  const studentId = verifyFarewellToken(req.nextUrl.searchParams.get("t"));
  if (!studentId) return notFound();
  try {
    const user = await leftUser(serviceClient(), studentId);
    if (!user) return notFound();
    const meta = user.app_metadata as Record<string, unknown>;
    const left = readLeft(meta.left)!;
    return NextResponse.json({ name: displayName(left.username), kind: left.kind, sent: !!meta.farewell }, { headers: noStore });
  } catch {
    return bad("Couldn't load. Try again.", 502);
  }
}

/** A trimmed answer, "" when absent, or null when it isn't text or is too long. */
function text(v: unknown): string | null {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length <= FAREWELL_TEXT_MAX ? t : null;
}

export async function POST(req: NextRequest) {
  if (!ready()) return bad("This isn't set up on the server yet.", 503);
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > BODY_MAX) return bad("bad request", raw.length > BODY_MAX ? 413 : 400);
  let b: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return bad("bad request");
    b = v as Record<string, unknown>;
  } catch {
    return bad("bad request");
  }

  const rating = b.rating === undefined || b.rating === null ? null : isRating(b.rating) ? b.rating : undefined;
  const helped = text(b.helped);
  const change = text(b.change);
  if (rating === undefined || helped === null || change === null) return bad("bad request");
  if (rating === null && !helped && !change) return bad("Nothing to send.");

  const sb = serviceClient();
  try {
    // Whose note: the farewell link, or the student's own sign-in.
    let studentId: string | null = null;
    if (b.t !== undefined) {
      studentId = verifyFarewellToken(b.t);
    } else {
      const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
      if (token && token.length < 4096) {
        // Asked of Supabase itself, so a made-up or expired sign-in never passes.
        const { data } = await sb.auth.getUser(token);
        if (data.user) {
          const { data: row } = await sb.from("students").select("id").eq("user_id", data.user.id).maybeSingle();
          studentId = (row?.id as string | undefined) ?? null;
        }
      }
    }
    if (!studentId) return notFound();
    const user = await leftUser(sb, studentId);
    if (!user) return notFound();

    const farewell: FarewellNote = { rating, helped, change, at: new Date().toISOString() };
    const { error } = await sb.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata ?? {}), farewell } });
    if (error) return bad("Couldn't send. Try again.", 502);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return bad("Couldn't send. Try again.", 502);
  }
}
