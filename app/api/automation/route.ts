import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";
import { DEFAULT_AUTOMATION, healthCheck, loadAutomation, saveAutomation, type AutomationSettings } from "@/lib/automation";

/**
 * Admin only. GET: the automation switches and anything Today should warn
 * about. POST { autoAbsent?, autoRelease? }: change a switch.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNREAD = "Couldn't read the automation settings just now. Try again in a moment.";

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ settings: DEFAULT_AUTOMATION, issues: [] });
  const sb = serviceClient();
  let s: Awaited<ReturnType<typeof loadAutomation>>;
  let issues: Awaited<ReturnType<typeof healthCheck>>;
  try {
    [s, issues] = await Promise.all([loadAutomation(sb), healthCheck(sb).catch(() => [])]);
  } catch (e) {
    // The account holding the switches couldn't be read: say so, never show defaults as if saved.
    console.error("[automation] load", e);
    return NextResponse.json({ error: UNREAD }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { settings: { autoAbsent: s.autoAbsent, autoRelease: s.autoRelease }, issues },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const adminId = await adminIdFromRequest(req);
  if (!adminId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const patch = (await req.json().catch(() => ({}))) as Partial<AutomationSettings>;
  let next: Awaited<ReturnType<typeof saveAutomation>>;
  try {
    next = await saveAutomation(serviceClient(), adminId, { autoAbsent: patch.autoAbsent, autoRelease: patch.autoRelease });
  } catch (e) {
    console.error("[automation] save", e);
    return NextResponse.json({ error: "Couldn't save the switch just now. Try again." }, { status: 503 });
  }
  return NextResponse.json({ settings: { ...DEFAULT_AUTOMATION, autoAbsent: next.autoAbsent ?? DEFAULT_AUTOMATION.autoAbsent, autoRelease: next.autoRelease ?? DEFAULT_AUTOMATION.autoRelease } });
}
