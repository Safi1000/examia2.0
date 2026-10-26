import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { diagnosticOpen, setDiagnosticOpen } from "@/lib/diagnostic/status-server";
import { pushReady } from "@/lib/push-server";

/** GET: is the Starting Point Check open? POST (admin) { open }: open or close it. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ open: await diagnosticOpen() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const adminId = await adminIdFromRequest(req);
  if (!adminId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 400 });
  const { open } = (await req.json().catch(() => ({}))) as { open?: boolean };
  await setDiagnosticOpen(adminId, !!open);
  revalidatePath("/starting-point");
  return NextResponse.json({ open: !!open });
}
