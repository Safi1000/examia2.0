import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { pushReady, serviceClient } from "@/lib/push-server";
import { INTERESTS, type Lead } from "@/lib/leads";
import { isValidPhone, normalizePhone } from "@/lib/phone";

/**
 * POST: a student joins the waitlist. Each sign-up is its own small file in
 * a private Supabase Storage bucket ("leads"), so no database change is
 * needed and two sign-ups at once never overwrite each other.
 * GET (admin): every sign-up, newest first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "leads";

async function ensureBucket(sb: ReturnType<typeof serviceClient>) {
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
}

export async function POST(req: NextRequest) {
  if (!pushReady()) return NextResponse.json({ error: "Sign-ups are not open yet." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Partial<Lead> & { website?: string } | null;
  if (!b) return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 400 });
  // Bots fill the hidden field; people never see it.
  if (b.website) return NextResponse.json({ ok: true });
  const name = String(b.name ?? "").trim().slice(0, 60);
  const phone = normalizePhone(String(b.phone ?? ""));
  if (!name) return NextResponse.json({ error: "Add your first name." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "Add your WhatsApp number with the country code, for example +923001234567." }, { status: 400 });
  const ids = new Set<string>(INTERESTS.map((i) => i.id));
  const lead: Lead = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    phone,
    level: String(b.level ?? "").slice(0, 30),
    subjects: (Array.isArray(b.subjects) ? b.subjects : []).map(String).slice(0, 3),
    interests: (Array.isArray(b.interests) ? b.interests : []).filter((i): i is Lead["interests"][number] => ids.has(String(i))),
    source: String(b.source ?? "").slice(0, 120),
    createdAt: new Date().toISOString(),
  };
  const sb = serviceClient();
  await ensureBucket(sb);
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(`${lead.id}.json`, new Blob([JSON.stringify(lead)], { type: "application/json" }), { contentType: "application/json" });
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ leads: [] });
  const sb = serviceClient();
  await ensureBucket(sb);
  const { data: files } = await sb.storage.from(BUCKET).list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  const leads = await Promise.all(
    (files ?? [])
      .filter((f) => f.name.endsWith(".json"))
      .map(async (f) => {
        const { data } = await sb.storage.from(BUCKET).download(f.name);
        try {
          return data ? (JSON.parse(await data.text()) as Lead) : null;
        } catch {
          return null;
        }
      }),
  );
  return NextResponse.json({ leads: leads.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
}
