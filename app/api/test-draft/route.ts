import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";
import { type Sb, cleanAnswers, cleanBy, cleanEdits, ensureBucket, fileOf, hasContent, isId, isoOrNull, readJson, storageReady, writeJson } from "@/lib/test-drafts-server";

/**
 * A copy of a student's test answers while they sit it, so a phone that dies,
 * a lost signal or a switch of device never loses what they typed.
 *
 * POST (the signed-in student): save their answers for one test.
 * POST { action: "begin" } (the signed-in student): start a fresh sitting
 *   (a late window, or a paper Hamza deleted so it can be sat again). The
 *   start time is the server's, and the same one comes back for a second
 *   device or a second tap. The old copy is kept aside as <test>.prev.json.
 * GET ?test=<id> (the signed-in student): their saved answers, or null, and
 *   when Hamza last cleared the test for a fresh sitting (resetAt).
 * GET ?time=1 (anyone): the server's clock, so a phone set to the wrong time
 *   can still count a test down correctly. Nothing else.
 *
 * One private JSON file per student and test in Supabase Storage (no database
 * change), readable only with the server key. Only the student's own answer
 * fields are kept; marks and keys are never stored here.
 *
 * Owner-only reading and collecting of these copies lives in ./admin.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 200_000;
const noStore = { "Cache-Control": "private, no-store" };

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
  if (!isId(body.testId)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const testId = body.testId;
  await ensureBucket(sb);

  // A fresh sitting: the server's time is the start. A second device (or a
  // second tap) in the same sitting gets the same start back, never a new one.
  if (body.action === "begin") {
    const sitting = isoOrNull(body.sitting);
    if (!sitting) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
    const before = await readJson(sb, fileOf(studentId, testId));
    const answersOf = (d: Record<string, unknown> | null) => cleanAnswers(d?.answers) ?? [];
    const carriedOf = (d: Record<string, unknown> | null) =>
      d && answersOf(d).length ? { answers: answersOf(d), edits: cleanEdits(d.edits) ?? {}, by: cleanBy(d.by) ?? {}, startedAt: isoOrNull(d.startedAt), savedAt: isoOrNull(d.savedAt) } : null;
    if (before && before.sitting === sitting && isoOrNull(before.startedAt)) {
      return NextResponse.json({ startedAt: before.startedAt, carried: carriedOf(before), now: Date.now() }, { headers: noStore });
    }
    // The old sitting's answers are kept aside. After a late window they are
    // carried into the new sitting too: only the clock is fresh, nothing they
    // wrote is dropped. (A blank copy left by an earlier fresh start: the one
    // kept aside then.) After a deleted paper the re-sit is a genuine re-take
    // and starts blank: the old answers stay kept aside, never loaded.
    const reset = await readJson(sb, fileOf(studentId, testId, ".reset"));
    const resetAt = isoOrNull(reset?.at);
    const afterDelete = !!resetAt && +new Date(resetAt) === +new Date(sitting);
    let carried = carriedOf(before);
    if (carried) await writeJson(sb, fileOf(studentId, testId, ".prev"), before);
    else if (!afterDelete) carried = carriedOf(await readJson(sb, fileOf(studentId, testId, ".prev")));
    if (afterDelete) carried = null;
    const now = new Date().toISOString();
    const fresh = {
      testId,
      studentId,
      answers: carried?.answers ?? [],
      ...(carried ? { edits: carried.edits, by: carried.by } : {}),
      currentIndex: 0,
      startedAt: now,
      savedAt: now,
      sitting,
    };
    const { error } = await writeJson(sb, fileOf(studentId, testId), fresh);
    if (error) return NextResponse.json({ error: "not saved" }, { status: 502, headers: noStore });
    return NextResponse.json({ startedAt: now, carried, now: Date.now() }, { headers: noStore });
  }

  const answers = cleanAnswers(body.answers);
  if (!answers) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  // A phone that hasn't managed to read this copy yet: it may only write over
  // a copy with nothing in it from another device, never over answers it
  // hasn't seen. Otherwise 409, and it reads (and joins) first.
  if (body.ifEmpty === true) {
    const device = isId(body.device) ? body.device : null;
    const have = await readJson(sb, fileOf(studentId, testId));
    const theirs = have ? (cleanAnswers(have.answers) ?? []).filter(hasContent) : [];
    const by = cleanBy(have?.by) ?? {};
    if (theirs.some((a) => !device || by[a.questionId] !== device)) {
      return NextResponse.json({ error: "read first" }, { status: 409, headers: noStore });
    }
  }
  const sitting = isoOrNull(body.sitting);
  const edits = cleanEdits(body.edits);
  const by = cleanBy(body.by);
  const draft = {
    testId,
    studentId,
    answers,
    currentIndex: Number.isInteger(body.currentIndex) ? Math.max(0, Math.min(500, body.currentIndex as number)) : 0,
    startedAt: isoOrNull(body.startedAt) ?? new Date().toISOString(),
    savedAt: new Date().toISOString(),
    ...(sitting ? { sitting } : {}),
    ...(edits ? { edits } : {}),
    ...(by ? { by } : {}),
  };
  const { error } = await writeJson(sb, fileOf(studentId, testId), draft);
  if (error) return NextResponse.json({ error: "not saved" }, { status: 502, headers: noStore });
  return NextResponse.json({ ok: true, savedAt: draft.savedAt, now: Date.now() }, { headers: noStore });
}

export async function GET(req: NextRequest) {
  // The clock only: no sign-in, no storage.
  if (req.nextUrl.searchParams.get("time")) return NextResponse.json({ now: Date.now() }, { headers: noStore });
  if (!storageReady()) return NextResponse.json({ draft: null, resetAt: null, now: Date.now() }, { headers: noStore });
  const testId = req.nextUrl.searchParams.get("test");
  if (!isId(testId)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const sb = serviceClient();
  const studentId = await studentOf(req, sb);
  if (!studentId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const [draft, reset] = await Promise.all([readJson(sb, fileOf(studentId, testId)), readJson(sb, fileOf(studentId, testId, ".reset"))]);
  return NextResponse.json({ draft, resetAt: isoOrNull(reset?.at), now: Date.now() }, { headers: noStore });
}
