import { type NextRequest, NextResponse } from "next/server";
import { pushReady, runReminders, serviceClient } from "@/lib/push-server";
import { googleReady } from "@/lib/google";
import { runClassAutomation } from "@/lib/class-automation";
import { runAutomations } from "@/lib/automation";

/**
 * Reminder check, class automation (Meet links, recordings) and the
 * hands-off jobs in lib/automation.ts (auto-absent, auto-release), every 15
 * minutes, called by a scheduler with
 * `Authorization: Bearer <CRON_SECRET>`. See DEVELOPER-HANDOFF.md.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Making a day's Meet links can take a few seconds.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Automations first (an auto-released result is then notified in this same
  // run). Each part runs on its own, so a Google hiccup never stops reminders.
  const automations = pushReady() ? await runAutomations(serviceClient()).catch((e) => ({ error: String(e) })) : null;
  const [reminders, classes] = await Promise.all([
    runReminders().catch((e) => ({ error: String(e) })),
    googleReady() && pushReady() ? runClassAutomation(serviceClient()).catch((e) => ({ error: String(e) })) : null,
  ]);
  return NextResponse.json({ automations, reminders, classes });
}
