import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";

/**
 * A copy of a student's test answers while they sit it, so a phone that dies,
 * a lost signal or a switch of device never loses what they typed.
 *
 * POST (the signed-in student): save their answers for one test.
 * GET ?test=<id> (the signed-in student): their saved answers, or null.
 *
 * One private JSON file per student and test in Supabase Storage (no database
 * change), readable only with the server key. Only the student's own answer
 * fields are kept; marks and keys are never stored here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "test-drafts";
const MAX_BYTES = 200_000;
const noStore = { "Cache-Control": "private, no-store" };

type Sb = ReturnType<typeof serviceClient>;
const storageReady = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

let bucketReady = false;
async function ensureBucket(sb: Sb) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
  bucketReady = true;
}

/** The signed-in student's id, or null. */
async function studentOf(req: NextRequest, sb: Sb): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user } = await anon.auth.getUser();
  if (!user.user) return null;
  const { data: row } = await sb.from("students").select("id").eq("user_id", user.user.id).maybeSingle();
  return (row?.id as string | undefined) ?? null;
}

/** Only the fields a student writes, each checked. */
function cleanAnswers(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 200).flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const x = a as Record<string, unknown>;
    if (!isId(x.questionId) || typeof x.type !== "string") return [];
    return [
      {
        questionId: x.questionId,
        type: x.type,
        ...(Number.isInteger(x.selectedIndex) ? { selectedIndex: x.selectedIndex as number } : {}),
        ...(typeof x.text === "string" ? { text: x.text.slice(0, 20_000) } : {}),
        ...(Array.isArray(x.photoUrls)
          ? { photoUrls: (x.photoUrls as unknown[]).filter((u): u is string => typeof u === "string" && /^https:\/\/res\.cloudinary\.com\//.test(u)).slice(0, 20) }
          : {}),
      },
    ];
  });
}

export async function POST(req: NextRequest) {
  if (!storageReady()) return NextResponse.json({ ok: true }, { headers: noStore });
  const sb = serviceClient();
  const studentId = await studentOf(req, sb);
  if (!studentId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413, headers: noStore });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {}
  const answers = cleanAnswers(body.answers);
  if (!isId(body.testId) || !answers) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const draft = {
    testId: body.testId,
    studentId,
    answers,
    currentIndex: Number.isInteger(body.currentIndex) ? Math.max(0, Math.min(500, body.currentIndex as number)) : 0,
    startedAt: typeof body.startedAt === "string" && !Number.isNaN(Date.parse(body.startedAt)) ? body.startedAt : new Date().toISOString(),
    savedAt: new Date().toISOString(),
  };
  await ensureBucket(sb);
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(`${studentId}/${body.testId}.json`, new Blob([JSON.stringify(draft)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) return NextResponse.json({ error: "not saved" }, { status: 502, headers: noStore });
  return NextResponse.json({ ok: true, savedAt: draft.savedAt }, { headers: noStore });
}

export async function GET(req: NextRequest) {
  if (!storageReady()) return NextResponse.json({ draft: null }, { headers: noStore });
  const testId = req.nextUrl.searchParams.get("test");
  if (!isId(testId)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const sb = serviceClient();
  const studentId = await studentOf(req, sb);
  if (!studentId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const { data } = await sb.storage.from(BUCKET).download(`${studentId}/${testId}.json`);
  if (!data) return NextResponse.json({ draft: null }, { headers: noStore });
  try {
    return NextResponse.json({ draft: JSON.parse(await data.text()) }, { headers: noStore });
  } catch {
    return NextResponse.json({ draft: null }, { headers: noStore });
  }
}
