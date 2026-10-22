import { type NextRequest, NextResponse } from "next/server";
import { runReminders } from "@/lib/push-server";

/**
 * Reminder check, every 15 minutes, called by a scheduler with
 * `Authorization: Bearer <CRON_SECRET>`. See DEVELOPER-HANDOFF.md.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runReminders());
}
