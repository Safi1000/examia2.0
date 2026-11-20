import { type NextRequest, NextResponse } from "next/server";
import { staffWith } from "@/lib/admin-auth";
import { notifyReleased, pushReady } from "@/lib/push-server";

/** Hamza just released results: tell those students (quiet rules apply). Admin only. */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!pushReady()) return NextResponse.json({ sent: 0, ready: false });
  // Hamza, or staff who may mark or run tests: nobody else releases a result.
  if (!(await staffWith(req, "marking", "tests"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { ids } = ((await req.json().catch(() => null)) ?? {}) as { ids?: unknown };
  // Paper ids only: anything else would make the lookup fail for the whole batch.
  const clean = (Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  try {
    return NextResponse.json({ sent: await notifyReleased(clean) });
  } catch (e) {
    // Not lost: the 15-minute check sends any result that hasn't gone out yet.
    console.error("[notify] released", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "could not send" }, { status: 502 });
  }
}
