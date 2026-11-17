import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";
import { clearKey, makeKey, readKey } from "@/lib/notes-import-server";

/**
 * Hamza only (never the assistant). GET: is there an upload key, and when was
 * it last used. POST: make a new one, shown once. DELETE: switch it off.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!ready()) return NextResponse.json({ error: "not set up" }, { status: 503, headers: noStore });
  const k = await readKey(serviceClient());
  return NextResponse.json({ on: !!k, createdAt: k?.createdAt ?? null, lastUsedAt: k?.lastUsedAt ?? null, lastNote: k?.lastNote ?? null }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!ready()) return NextResponse.json({ error: "not set up" }, { status: 503, headers: noStore });
  try {
    return NextResponse.json({ key: await makeKey(serviceClient()) }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "The key couldn't be saved. Try again." }, { status: 502, headers: noStore });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!ready()) return NextResponse.json({ error: "not set up" }, { status: 503, headers: noStore });
  await clearKey(serviceClient());
  return NextResponse.json({ ok: true }, { headers: noStore });
}
