import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { accessToken, authUrl, googleReady } from "@/lib/google";
import { pushReady, serviceClient } from "@/lib/push-server";
import { findTestRecording, makeTestClass, runClassAutomation } from "@/lib/class-automation";

/**
 * Admin only. GET: is Google connected? POST { action }:
 *   "connect"    -> the Google sign-in URL to send Hamza to
 *   "sync"       -> make today's links / pick up recordings now
 *   "disconnect" -> forget the account (links already made stay)
 *   "test"       -> a 20-minute test class starting now (students never see it)
 *   "test-check" -> has that test class's recording reached Drive yet?
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Making a day's Meet links can take a few seconds.
export const maxDuration = 60;

const ready = () => googleReady() && pushReady();

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ready()) return NextResponse.json({ ready: false, connected: false });
  const sb = serviceClient();
  const { data } = await sb.from("google_account").select("email").eq("id", 1).maybeSingle();
  // Connected on paper isn't enough: try a real sign-in, so a lapsed
  // connection (password change, access removed) shows before class time.
  const broken = !!data && !(await accessToken(sb).catch(() => null));
  return NextResponse.json({ ready: true, connected: !!data, broken, email: data?.email ?? null });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ready()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const { action, eventId, startedAt } = (await req.json().catch(() => ({}))) as { action?: string; eventId?: string; startedAt?: string };
  if (action === "connect") return NextResponse.json({ url: authUrl(req.nextUrl.origin) });
  if (action === "sync") return NextResponse.json(await runClassAutomation(serviceClient(), Date.now(), true));
  if (action === "test") return NextResponse.json(await makeTestClass(serviceClient()));
  if (action === "test-check" && eventId && startedAt) return NextResponse.json(await findTestRecording(serviceClient(), eventId, startedAt));
  if (action === "disconnect") {
    await serviceClient().from("google_account").delete().eq("id", 1);
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
