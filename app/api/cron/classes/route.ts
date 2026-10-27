import { type NextRequest, NextResponse } from "next/server";
import { runClassReminders } from "@/lib/push-server";

/**
 * The every-minute class check, during class hours: a reminder a minute or
 * two after each class starts, to students who haven't joined. Called by a
 * scheduler with `Authorization: Bearer <CRON_SECRET>` (developer-setup/
 * 5-class-check.sql). The 15-minute job is the fallback if this isn't set up.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runClassReminders().catch((e) => ({ error: String(e) })));
}
