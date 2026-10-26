import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";

/**
 * POST (admin) { id, notes }: Hamza's note and written-answer feedback for
 * one result, saved beside it in the private "diagnostics" bucket
 * (notes/<id>.json). The results GET returns them with each result.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { id?: string; notes?: unknown } | null;
  const id = String(b?.id ?? "");
  if (!/^[0-9a-z-]{6,40}$/.test(id) || !b?.notes) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const text = JSON.stringify(b.notes);
  if (text.length > 50_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const { error } = await serviceClient()
    .storage.from("diagnostics")
    .upload(`notes/${id}.json`, new Blob([text], { type: "application/json" }), { contentType: "application/json", upsert: true });
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
