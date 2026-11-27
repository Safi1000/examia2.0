import { randomInt } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { adminIdFromRequest, staffWith } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";
import { accessMarks } from "@/lib/paused-server";
import { studentEmail } from "@/lib/config";
import { farewellOrigin, farewellUrl } from "@/lib/farewell-server";
import { isLeftKind, isPauseReason, readLeft, type FarewellNote, type LeftKind, type LeftMark, type PauseReason } from "@/lib/farewell-copy";

/**
 * Pausing a student's access, and marking a student as left.
 *
 * A paused student can still sign in, but the portal shows them a calm
 * "Your access is paused" screen (with Hamza's reason, if given) until Hamza
 * resumes them (see lib/access-paused.ts and the student layout). While paused
 * they get no phone notifications (lib/push-server.ts), are never marked absent
 * automatically (lib/automation.ts), and are left out of "Mark the rest",
 * Today's lists and the parent reminders (lib/paused.ts). Nothing of theirs is
 * deleted or changed.
 *
 * A student who has LEFT (finished the course, or dropped out) is always paused
 * too, so all of the above applies. Their login is renamed to
 * `<original>--x<4 letters>` so the original username is free for a new
 * student; their results keep showing the real name (lib/display-name.ts). A
 * session already open on their phone keeps working and shows a farewell
 * screen with a feedback ask (also reachable by the link returned here).
 *
 *   GET                               staff: who is paused (and why) and who has left
 *   POST { ids, paused, reason? }     Hamza only: pause or resume ("fees" | "break" | null)
 *   POST { ids, left: kind }          Hamza only: mark as left ("finished" | "dropped")
 *   POST { ids, left: null }          Hamza only: bring back
 *
 * The marks live on the student's sign-in account (app_metadata), which only
 * the server can write, so a student cannot lift them. No database change.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const MAX_IDS = 500;
const USERNAME = /^[a-z0-9._-]{3,30}$/;
const FREED = /--x[a-z0-9]{4}$/;

type LeftOut = LeftMark & { farewell?: FarewellNote | Pick<FarewellNote, "rating" | "at"> };

export async function GET(req: NextRequest) {
  // Hamza, or staff whose part of the console lists students. Not someone who may only read notes.
  if (!(await staffWith(req, "students", "marking", "homework", "tests", "attendance", "classes", "analytics"))) return bad("forbidden", 403);
  if (!ready()) return NextResponse.json({ paused: [], reasons: {}, left: {} }, { headers: noStore });
  // What a student wrote is for Hamza only; staff see the rating at most.
  const owner = !!(await adminIdFromRequest(req));
  const sb = serviceClient();
  try {
    const marks = await accessMarks(sb);
    const reasons: Record<string, PauseReason> = Object.fromEntries(marks.reasons);
    const left: Record<string, LeftOut> = {};
    for (const [id, m] of marks.left) {
      const { farewell, ...rest } = m;
      left[id] = farewell ? { ...rest, farewell: owner ? farewell : { rating: farewell.rating, at: farewell.at } } : rest;
    }
    return NextResponse.json({ paused: [...marks.paused], reasons, left }, { headers: noStore });
  } catch {
    return bad("Couldn't load. Try again.", 502);
  }
}

type Row = { id: string; user_id: string | null; username: string | null };
type Failed = Array<{ id: string; why: string }>;
type Sb = SupabaseClient;

/** `<original, cut to 22>--x<4 random letters or digits>`: fits the username rule (3 to 30 of a-z 0-9 . _ -). */
function freedName(original: string): string {
  const base = original.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 22);
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += abc[randomInt(abc.length)];
  return `${base}--x${tail}`;
}

/** True when another student already has this username (or the read failed: then treat it as taken). */
async function usernameTaken(sb: Sb, username: string, exceptId: string): Promise<boolean> {
  const names = [...new Set([username, username.toLowerCase()])];
  const { data, error } = await sb.from("students").select("id").in("username", names).neq("id", exceptId).limit(1);
  return !!error || (data?.length ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!ready()) return bad("This isn't set up on the server yet.", 503);
  const b = (await req.json().catch(() => null)) as { ids?: unknown; paused?: unknown; reason?: unknown; left?: unknown } | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.ids)) return bad("bad request");
  if (b.ids.length > MAX_IDS) return bad(`At most ${MAX_IDS} students at a time.`);
  const ids = [...new Set(b.ids.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 80))];
  if (!ids.length) return bad("bad request");

  // Exactly one of the three actions, with clean values.
  const hasLeft = "left" in b;
  const hasPaused = "paused" in b;
  if (hasLeft === hasPaused) return bad("bad request");
  if (hasPaused && typeof b.paused !== "boolean") return bad("bad request");
  if (hasPaused && b.reason !== undefined && b.reason !== null && !isPauseReason(b.reason)) return bad("bad request");
  if (hasLeft && b.left !== null && !isLeftKind(b.left)) return bad("bad request");

  const sb = serviceClient();
  const { data: rows, error } = await sb.from("students").select("id,user_id,username").in("id", ids);
  if (error) return bad("Couldn't change that. Try again.", 502);
  const rowOf = new Map(((rows ?? []) as Row[]).map((r) => [r.id, r]));

  const done: string[] = [];
  const failed: Failed = [];
  const renamed: Record<string, string> = {};
  const links: Record<string, string> = {};
  const notRestored: string[] = [];
  const origin = farewellOrigin(req);

  for (const id of ids) {
    const row = rowOf.get(id);
    if (!row?.user_id) {
      failed.push({ id, why: row ? "no login yet" : "not found" });
      continue;
    }
    const { data: got } = await sb.auth.admin.getUserById(row.user_id);
    const meta = (got.user?.app_metadata ?? null) as Record<string, unknown> | null;
    // Never a teacher's or an assistant's account.
    if (!got.user || meta?.role === "admin") {
      failed.push({ id, why: "not a student login" });
      continue;
    }
    const user = got.user;
    const m = meta ?? {};

    if (hasPaused) {
      const paused = b.paused as boolean;
      if (!paused && readLeft(m.left)) {
        failed.push({ id, why: "has left; bring them back instead" });
        continue;
      }
      const reason = paused && isPauseReason(b.reason) ? b.reason : null;
      const { error: saveError } = await sb.auth.admin.updateUserById(user.id, { app_metadata: { ...m, paused, pause_reason: reason } });
      if (saveError) failed.push({ id, why: "the save failed" });
      else done.push(id);
      continue;
    }

    if (b.left === null) {
      const r = await bringBack(sb, row, user, m);
      if ("why" in r) failed.push({ id, why: r.why });
      else {
        done.push(id);
        renamed[id] = r.username;
        if (!r.restored) notRestored.push(id);
      }
      continue;
    }

    const r = await markLeft(sb, row, user, m, b.left as LeftKind);
    if ("why" in r) {
      failed.push({ id, why: r.why });
      continue;
    }
    done.push(id);
    renamed[id] = r.username;
    const link = farewellUrl(origin, id);
    if (link) links[id] = link;
  }

  const ok = failed.length === 0;
  if (hasPaused) return NextResponse.json({ ok, done, failed }, { headers: noStore });
  if (b.left === null) return NextResponse.json({ ok, done, failed, renamed, notRestored }, { headers: noStore });
  return NextResponse.json({ ok, done, failed, renamed, links }, { headers: noStore });
}

/**
 * Mark one student as left: paused, `left` set, login renamed so the original
 * username is free. Already left: only the kind changes (the original name and
 * date are kept, and the login isn't renamed again).
 */
async function markLeft(sb: Sb, row: Row, user: User, m: Record<string, unknown>, kind: LeftKind): Promise<{ username: string } | { why: string }> {
  const current = (row.username ?? "").trim();
  const already = readLeft(m.left);
  if (already) {
    const { error } = await sb.auth.admin.updateUserById(user.id, { app_metadata: { ...m, paused: true, left: { ...already, kind } } });
    return error ? { why: "the save failed" } : { username: current };
  }
  if (!current) return { why: "no username" };
  const left: LeftMark = { kind, at: new Date().toISOString(), username: current };

  for (let attempt = 0; attempt < 3; attempt++) {
    const next = freedName(current);
    if (!USERNAME.test(next) || (await usernameTaken(sb, next, row.id))) continue;
    // 1. The sign-in: new login email and the marks together.
    const { error: authError } = await sb.auth.admin.updateUserById(user.id, {
      email: studentEmail(next),
      app_metadata: { ...m, paused: true, left },
    });
    if (authError) continue; // most likely that email is taken: try another name
    // 2. The roster's username. If it can't be saved, put the sign-in back as it was.
    const { error: rowError } = await sb.from("students").update({ username: next }).eq("id", row.id);
    if (rowError) {
      await sb.auth.admin.updateUserById(user.id, {
        ...(user.email ? { email: user.email } : {}),
        app_metadata: { ...m, paused: m.paused === true, left: null },
      });
      return { why: "the save failed" };
    }
    return { username: next };
  }
  return { why: "couldn't free the username" };
}

/**
 * Bring one student back: clear left, paused and the reason. Their original
 * username comes back if nobody has taken it since; otherwise they keep the
 * freed one (restored: false) and Hamza can rename them from Students.
 */
async function bringBack(sb: Sb, row: Row, user: User, m: Record<string, unknown>): Promise<{ username: string; restored: boolean } | { why: string }> {
  const current = (row.username ?? "").trim();
  const left = readLeft(m.left);
  if (!left) return { why: "hasn't left" };
  const cleared = { ...m, paused: false, pause_reason: null, left: null };
  const original = left.username.trim();
  const canRestore = original && original !== current && FREED.test(current) && !(await usernameTaken(sb, original, row.id));

  if (canRestore) {
    const { error: authError } = await sb.auth.admin.updateUserById(user.id, { email: studentEmail(original), app_metadata: cleared });
    if (!authError) {
      const { error: rowError } = await sb.from("students").update({ username: original }).eq("id", row.id);
      if (!rowError) return { username: original, restored: true };
      // The roster kept the freed name: the sign-in must match it again (they are back either way).
      const { error: undoError } = await sb.auth.admin.updateUserById(user.id, { email: studentEmail(current), app_metadata: cleared });
      return undoError ? { why: "the save failed" } : { username: current, restored: false };
    }
    // The login email is taken (or the save failed): bring them back under the freed name.
  }
  const { error } = await sb.auth.admin.updateUserById(user.id, { app_metadata: cleared });
  if (error) return { why: "the save failed" };
  return { username: current, restored: original === current };
}
