import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import { type CleanAnswer, type Sb, cleanAnswers, ensureBucket, fileOf, hasContent, isId, isoOrNull, readJson, storageReady, writeJson } from "@/lib/test-drafts-server";

/**
 * Hamza's side of the saved test copies (see /api/test-draft). Owner only:
 * the assistant never gets these.
 *
 * POST { action: "reset", testId, studentId }
 *   Hamza deleted this student's paper so they can sit it again: their old
 *   start time and saved copy stop counting, and they get a fresh clock.
 * POST { action: "unsent", testId, studentIds }
 *   Of these students, the ones whose answers are saved here but were never
 *   handed in (the phone died, the last hand in failed). Nothing changes.
 * POST { action: "collect", testId, studentIds }
 *   Hands those copies in, as papers handed in at time up. Each one is saved
 *   with Hamza's own sign-in (the database's hand in checks only let a
 *   student or Hamza in, never the server key), and a paper whose answers
 *   don't save is taken out again, so nothing half saved is left behind.
 *
 * Only for a test that closed for everyone at least 30 minutes ago, and
 * never for a student who has handed in or whose late window ended less than
 * 30 minutes ago: a phone still retrying its own hand in on a weak signal
 * must get there first (the database keeps the first paper in).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const MAX_STUDENTS = 400;
/** How long after closing before unsent answers can be collected. */
const SETTLE_MS = 30 * 60_000;

type Leftover = { studentId: string; answers: CleanAnswer[]; startedAt: string | null; savedAt: string; answered: number };

/** "/test/<id>#until=<ISO>" -> ms, or 0. */
const untilMs = (link: unknown) => {
  const m = typeof link === "string" ? link.match(/#until=([^&]+)$/) : null;
  const t = m ? +new Date(decodeURIComponent(m[1])) : 0;
  return Number.isFinite(t) ? t : 0;
};

/** The test, if it has closed for everyone; otherwise why not. */
async function closedTest(sb: Sb, testId: string) {
  const { data } = await sb.from("tests").select("id, status, closes_at, duration_minutes, questions(id, type)").eq("id", testId).maybeSingle();
  if (!data) return { error: "That test isn't there any more." } as const;
  const t = data as { status: string; closes_at: string; duration_minutes: number; questions: { id: string; type: string }[] | null };
  if (t.status === "draft") return { error: "That test is a draft." } as const;
  if (+new Date(t.closes_at) + SETTLE_MS > Date.now()) return { error: "Unsent answers can be collected 30 minutes after the test closes, so nobody still handing in is cut short." } as const;
  return { test: t } as const;
}

/** Saved copies for these students that were never handed in, ready to collect. */
async function leftovers(sb: Sb, testId: string, studentIds: string[], questions: { id: string; type: string }[]): Promise<Leftover[]> {
  const [subs, windows] = await Promise.all([
    sb.from("submissions").select("student_id").eq("test_id", testId),
    sb.from("activities").select("student_id, link").eq("type", "test_reopened").eq("test_id", testId),
  ]);
  const handedIn = new Set(((subs.data as { student_id: string }[] | null) ?? []).map((r) => r.student_id));
  const stillOpen = new Set(
    ((windows.data as { student_id: string | null; link: string | null }[] | null) ?? [])
      .filter((w) => w.student_id && untilMs(w.link) + SETTLE_MS > Date.now())
      .map((w) => w.student_id as string),
  );
  const kinds = new Map(questions.map((q) => [q.id, q.type]));
  const todo = studentIds.filter((id) => !handedIn.has(id) && !stillOpen.has(id));
  const out: Leftover[] = [];
  // A few at a time: one file per student.
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const found = await Promise.all(
      batch.map(async (studentId) => {
        const [main, prev, reset] = await Promise.all([
          readJson(sb, fileOf(studentId, testId)),
          readJson(sb, fileOf(studentId, testId, ".prev")),
          readJson(sb, fileOf(studentId, testId, ".reset")),
        ]);
        const resetAt = isoOrNull(reset?.at);
        // The copy, or (when it is empty, a fresh sitting never answered) the one kept aside before it.
        const usable = (draft: Record<string, unknown> | null): Leftover | null => {
          const savedAt = isoOrNull(draft?.savedAt);
          if (!draft || !savedAt) return null;
          // Saved before Hamza deleted their paper: that sitting is over.
          if (resetAt && +new Date(resetAt) >= +new Date(savedAt)) return null;
          // Only answers to questions still on the paper, of the same kind.
          const answers = (cleanAnswers(draft.answers) ?? []).filter((a) => kinds.get(a.questionId) === a.type);
          const answered = answers.filter(hasContent).length;
          return answered ? { studentId, answers, startedAt: isoOrNull(draft.startedAt), savedAt, answered } : null;
        };
        return usable(main) ?? usable(prev);
      }),
    );
    for (const f of found) if (f) out.push(f);
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "Only Hamza can do that." }, { status: 403, headers: noStore });
  if (!storageReady()) return NextResponse.json({ error: "Saved copies aren't set up on this server." }, { status: 503, headers: noStore });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {}
  const testId = body.testId;
  if (!isId(testId)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const sb = serviceClient();
  await ensureBucket(sb);

  if (body.action === "reset") {
    if (!isId(body.studentId)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
    const { error } = await writeJson(sb, fileOf(body.studentId, testId, ".reset"), { at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: "not saved" }, { status: 502, headers: noStore });
    // Their old start time goes too, so a re-sit while the test is still open
    // gets a fresh start on the server and isn't judged late against the old
    // one. Only after the paper itself is gone (a start with no paper is all
    // this removes), and with the server key: no one else can delete these.
    // (The delete is sent at the same moment as this, so it gets a few seconds to land.)
    for (let i = 0; i < 4; i++) {
      const { data: still, error: readErr } = await sb.from("submissions").select("id").eq("test_id", testId).eq("student_id", body.studentId).maybeSingle();
      if (readErr) break;
      if (!still) {
        await sb.from("test_attempts").delete().eq("test_id", testId).eq("student_id", body.studentId);
        break;
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  if (body.action !== "unsent" && body.action !== "collect") return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.filter(isId))].slice(0, MAX_STUDENTS) : [];
  const found = await closedTest(sb, testId);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: 409, headers: noStore });
  const test = found.test;
  const list = await leftovers(sb, testId, studentIds, test.questions ?? []);

  if (body.action === "unsent") {
    return NextResponse.json({ unsent: list.map(({ studentId, answered, savedAt }) => ({ studentId, answered, savedAt })) }, { headers: noStore });
  }

  // Saved with Hamza's own sign-in, so the database's checks treat it as his.
  const token = req.headers.get("authorization")!.replace(/^Bearer /, "");
  const asHamza = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: attempts } = await sb.from("test_attempts").select("student_id, started_at").eq("test_id", testId);
  const startOf = new Map(((attempts as { student_id: string; started_at: string }[] | null) ?? []).map((a) => [a.student_id, a.started_at]));

  const collected: string[] = [];
  const failed: string[] = [];
  for (const l of list) {
    const startedAt = startOf.get(l.studentId) ?? l.startedAt ?? l.savedAt;
    const seconds = Math.max(0, Math.round((+new Date(l.savedAt) - +new Date(startedAt)) / 1000));
    const id = randomUUID();
    const sub = await asHamza.from("submissions").insert({
      id,
      test_id: testId,
      student_id: l.studentId,
      status: "submitted",
      started_at: startedAt,
      // When the answers were last saved: the work stopped then, not now.
      submitted_at: l.savedAt,
      auto_submitted: true,
      duration_seconds: Math.min(seconds, test.duration_minutes * 60),
      late: true,
    });
    if (sub.error) {
      failed.push(l.studentId);
      continue;
    }
    const rows = l.answers.map((a) => ({
      submission_id: id,
      question_id: a.questionId,
      type: a.type,
      selected_index: a.selectedIndex ?? null,
      text: a.text ?? null,
      photo_url: a.photoUrls?.[0] ?? null,
      photo_urls: a.photoUrls ?? [],
    }));
    const ans = rows.length ? await asHamza.from("answers").insert(rows) : { error: null };
    if (ans.error) {
      // Never leave a paper with no answers behind: take it out again.
      await asHamza.from("submissions").delete().eq("id", id);
      failed.push(l.studentId);
      continue;
    }
    collected.push(l.studentId);
  }
  return NextResponse.json({ collected, failed }, { headers: noStore });
}
