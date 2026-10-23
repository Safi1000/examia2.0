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

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ settings: DEFAULT_AUTOMATION, issues: [] });
  const sb = serviceClient();
  const [s, issues] = await Promise.all([loadAutomation(sb), healthCheck(sb).catch(() => [])]);
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
  const next = await saveAutomation(serviceClient(), adminId, { autoAbsent: patch.autoAbsent, autoRelease: patch.autoRelease });
  return NextResponse.json({ settings: { ...DEFAULT_AUTOMATION, autoAbsent: next.autoAbsent ?? DEFAULT_AUTOMATION.autoAbsent, autoRelease: next.autoRelease ?? DEFAULT_AUTOMATION.autoRelease } });
}
