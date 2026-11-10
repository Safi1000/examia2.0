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

/** Checked once per server start, not on every sign-up. */
let bucketReady = false;
async function ensureBucket(sb: ReturnType<typeof serviceClient>) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
  bucketReady = true;
}

/** The real form sends a few hundred characters. */
const MAX_BODY = 8_000;
/**
 * A script posting over and over can't fill the list: a handful of sign-ups
 * per connection every ten minutes (a family or a classroom on one wifi still
 * fits). Counted per server, so it slows a flood rather than stopping one.
 */
const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 20;
const seen = new Map<string, { n: number; until: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  if (seen.size > 5000) for (const [k, v] of seen) if (v.until <= now) seen.delete(k);
  const hit = seen.get(ip);
  if (!hit || hit.until <= now) {
    seen.set(ip, { n: 1, until: now + WINDOW_MS });
    return false;
  }
  hit.n++;
  return hit.n > PER_WINDOW;
}

export async function POST(req: NextRequest) {
  if (!pushReady()) return NextResponse.json({ error: "Sign-ups are not open yet." }, { status: 503 });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 413 });
  let b: (Partial<Lead> & { website?: string }) | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) b = parsed as Partial<Lead> & { website?: string };
  } catch {}
  if (!b) return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 400 });
  // Bots fill the hidden field; people never see it.
  if (b.website) return NextResponse.json({ ok: true });
  const name = String(b.name ?? "").trim().slice(0, 60);
  const phone = normalizePhone(String(b.phone ?? ""));
  if (!name) return NextResponse.json({ error: "Add your first name." }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "Add your WhatsApp number with the country code, for example +923001234567." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (tooMany(ip)) return NextResponse.json({ error: "Too many sign-ups from this connection. Try again in a few minutes." }, { status: 429 });
  const ids = new Set<string>(INTERESTS.map((i) => i.id));
  const lead: Lead = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    phone,
    level: String(b.level ?? "").slice(0, 30),
    subjects: (Array.isArray(b.subjects) ? b.subjects : []).slice(0, 3).map((s) => String(s).slice(0, 40)),
    // Each interest once: a list repeating the same one thousands of times made a huge file.
    interests: [...new Set(Array.isArray(b.interests) ? b.interests.slice(0, 20) : [])].filter((i): i is Lead["interests"][number] => typeof i === "string" && ids.has(i)),
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
  // The storage list stops at 1,000 per call: read every page, so sign-ups
  // past the first thousand don't silently drop off the list.
  const names: string[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data: files, error } = await sb.storage
      .from(BUCKET)
      .list("", { limit: 1000, offset, sortBy: { column: "name", order: "desc" } });
    // A page that won't read must not pass for "that's everyone".
    if (error) return NextResponse.json({ error: "Couldn't read the waitlist just now. Try again." }, { status: 503 });
    names.push(...(files ?? []).map((f) => f.name).filter((n) => n.endsWith(".json")));
    if ((files ?? []).length < 1000) break;
  }
  const leads: Array<Lead | null> = [];
  // 20 at a time: hundreds of downloads at once get throttled, and a lead that
  // fails to download would silently drop off the list.
  for (let i = 0; i < names.length; i += 20) {
    leads.push(
      ...(await Promise.all(
        names.slice(i, i + 20).map(async (name) => {
          const { data } = await sb.storage.from(BUCKET).download(name);
          try {
            return data ? (JSON.parse(await data.text()) as Lead) : null;
          } catch {
            return null;
          }
        }),
      )),
    );
  }
  return NextResponse.json({ leads: leads.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
}
