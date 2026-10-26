import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { diagnosticStatus, setDiagnosticStatus } from "@/lib/diagnostic/status-server";
import { pushReady } from "@/lib/push-server";

/** GET: is the check open, and which one? POST (admin) { open, kind }: change it. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await diagnosticStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const adminId = await adminIdFromRequest(req);
  if (!adminId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { open?: boolean; kind?: string };
  const now = await diagnosticStatus();
  const next = { open: b.open ?? now.open, kind: b.kind === "end" ? "end" : b.kind === "start" ? "start" : now.kind } as const;
  await setDiagnosticStatus(adminId, next);
  revalidatePath("/starting-point");
  return NextResponse.json(next);
}
