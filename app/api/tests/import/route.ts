import { type NextRequest, NextResponse } from "next/server";
import { randomUUID, randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";
import { checkKey, touchKey } from "@/lib/notes-import-server";
import { levelOfName, subjectOfName, type NoteLevel, type NoteSubject } from "@/lib/notes-library";
import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from "@/lib/config";

/**
 * Tests made outside the console (Claude on Hamza's Mac) are added here with
 * the same upload key as notes, never a sign-in. This route only ever makes
 * DRAFTS: students cannot see a draft, and nothing is announced. Hamza checks
 * each one in the console and presses Publish there (which also notifies students).
 *
 *   plan   : where a level and subject live (class, subject), the file storage
 *            to send the paper to, and the latest test names (to match the naming).
 *   create : add one draft test with its questions and MCQ keys.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const LEVELS: NoteLevel[] = ["IGCSE and O Level", "AS", "A2"];
const SUBJECTS: NoteSubject[] = ["Accounting", "Business", "Economics"];
type Row = Record<string, unknown>;

const asLevel = (v: unknown) => LEVELS.find((l) => l === v) ?? null;
const asSubject = (v: unknown) => SUBJECTS.find((s) => s === v) ?? null;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const wholeMarks = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100 ? v : null);
const isoTime = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** The class and subject rows for a level and subject. */
async function place(sb: SupabaseClient, level: NoteLevel, subject: NoteSubject) {
  const [cls, subj] = await Promise.all([sb.from("classes").select("id,name"), sb.from("subjects").select("id,name")]);
  if (cls.error) throw new Error(cls.error.message);
  if (subj.error) throw new Error(subj.error.message);
  const c = ((cls.data ?? []) as Row[]).filter((r) => levelOfName(r.name as string) === level);
  const s = ((subj.data ?? []) as Row[]).filter((r) => subjectOfName(r.name as string) === subject);
  return {
    classes: c.map((r) => ({ id: r.id as string, name: r.name as string })),
    subjects: s.map((r) => ({ id: r.id as string, name: r.name as string })),
  };
}

type QIn =
  | { type: "mcq"; prompt: string; options: string[]; correctIndex: number; marks: number; topic: string }
  | { type: "photo"; prompt: string; marks: number; topic: string; attachments: string[] };

/** Checks one question from the request. Returns an error message, or the clean question. */
function readQuestion(q: Row, n: number): QIn | string {
  const marks = wholeMarks(q.marks);
  if (!marks) return `Question ${n}: marks must be a whole number from 1 to 100.`;
  const topic = text(q.topic, 120) || "General";
  const prompt = text(q.prompt, 6000);
  if (q.type === "mcq") {
    const options = Array.isArray(q.options) ? (q.options as unknown[]).map((o) => text(o, 600)) : [];
    if (options.length < 2 || options.length > 6 || options.some((o) => !o)) return `Question ${n}: an MCQ needs 2 to 6 filled options.`;
    const ci = q.correctIndex;
    if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= options.length) return `Question ${n}: the answer key is missing or out of range.`;
    if (!prompt) return `Question ${n}: an MCQ needs its question.`;
    return { type: "mcq", prompt, options, correctIndex: ci, marks, topic };
  }
  if (q.type === "photo") {
    const attachments = Array.isArray(q.attachments) ? (q.attachments as unknown[]).map((a) => (typeof a === "string" ? a : "")) : [];
    // Only pages in the site's own storage, never a link to somewhere else.
    const home = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/`;
    if (!CLOUDINARY_CLOUD || attachments.length > 60 || attachments.some((a) => !a.startsWith(home))) return `Question ${n}: the paper pages must be in the site's storage.`;
    return { type: "photo", prompt, marks, topic, attachments };
  }
  return `Question ${n}: type must be "mcq" or "photo".`;
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ error: "not set up" }, { status: 503, headers: noStore });
  const sb = serviceClient();
  if (!(await checkKey(sb, req.headers.get("x-notes-key")))) return NextResponse.json({ error: "That upload key isn't valid. Make a new one in Settings." }, { status: 401, headers: noStore });
  const body = (await req.json().catch(() => null)) as Row | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });

  try {
    if (body.action === "plan") {
      const items = Array.isArray(body.items) ? (body.items as Row[]).slice(0, 20) : [];
      const out = [];
      for (const it of items) {
        const level = asLevel(it.level);
        const subject = asSubject(it.subject);
        if (!level || !subject) {
          out.push({ error: "Needs a level and a subject." });
          continue;
        }
        out.push({ level, subject, ...(await place(sb, level, subject)) });
      }
      const recent = await sb.from("tests").select("title,subject,test_code,status,created_at").order("created_at", { ascending: false }).limit(25);
      if (recent.error) throw new Error(recent.error.message);
      return NextResponse.json({ items: out, recent: recent.data ?? [], cloud: CLOUDINARY_CLOUD, preset: CLOUDINARY_PRESET }, { headers: noStore });
    }

    if (body.action === "check") {
      // Read-only: how named tests stand in the portal right now (for a pre-opening check).
      const titles = Array.isArray(body.titles) ? (body.titles as unknown[]).map((t) => text(t, 200)).filter(Boolean).slice(0, 30) : [];
      if (!titles.length) return NextResponse.json({ error: "Needs titles." }, { status: 400, headers: noStore });
      const [tests, cls, subj] = await Promise.all([
        sb.from("tests").select("id,title,subject,status,test_code,duration_minutes,upload_minutes,opens_at,closes_at,cohort_id,class_id,subject_id").in("title", titles),
        sb.from("classes").select("id,name"),
        sb.from("subjects").select("id,name"),
      ]);
      for (const r of [tests, cls, subj]) if (r.error) throw new Error(r.error.message);
      const rows = (tests.data ?? []) as Row[];
      const ids = rows.map((r) => r.id as string);
      const [qs, subs] = await Promise.all([
        ids.length ? sb.from("questions").select("id,test_id,type,prompt,marks,options,attachment_urls,sort_order").in("test_id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? sb.from("submissions").select("id,test_id").in("test_id", ids) : Promise.resolve({ data: [], error: null }),
      ]);
      if (qs.error) throw new Error(qs.error.message);
      if (subs.error) throw new Error(subs.error.message);
      const qRows = (qs.data ?? []) as Row[];
      const keys = qRows.length ? await sb.from("question_keys").select("question_id,correct_index").in("question_id", qRows.map((q) => q.id as string)) : { data: [], error: null };
      if (keys.error) throw new Error(keys.error.message);
      const keyOf = new Map(((keys.data ?? []) as Row[]).map((k) => [k.question_id as string, k.correct_index as number]));
      const nameOf = (list: unknown, id: unknown) => ((list ?? []) as Row[]).find((r) => r.id === id)?.name ?? null;
      const out = rows.map((t) => ({
        title: t.title, status: t.status, testCode: t.test_code, subject: t.subject,
        className: nameOf(cls.data, t.class_id), subjectName: nameOf(subj.data, t.subject_id), allCohorts: t.cohort_id === null,
        durationMinutes: t.duration_minutes, uploadMinutes: t.upload_minutes, opensAt: t.opens_at, closesAt: t.closes_at,
        submissions: ((subs.data ?? []) as Row[]).filter((s) => s.test_id === t.id).length,
        questions: qRows.filter((q) => q.test_id === t.id).sort((a, b) => (a.sort_order as number) - (b.sort_order as number)).map((q) => ({
          type: q.type, marks: q.marks, prompt: String(q.prompt ?? "").slice(0, 160),
          options: Array.isArray(q.options) ? (q.options as unknown[]).length : 0,
          key: q.type === "mcq" ? (keyOf.has(q.id as string) ? keyOf.get(q.id as string) : null) : undefined,
          pages: Array.isArray(q.attachment_urls) ? (q.attachment_urls as string[]) : [],
        })),
      }));
      return NextResponse.json({ tests: out, missing: titles.filter((t) => !rows.some((r) => r.title === t)) }, { headers: noStore });
    }

    if (body.action === "create") {
      const level = asLevel(body.level);
      const subject = asSubject(body.subject);
      const title = text(body.title, 200);
      if (!level || !subject || !title) return NextResponse.json({ error: "Needs a level, a subject and a title." }, { status: 400, headers: noStore });
      const duration = typeof body.durationMinutes === "number" && Number.isInteger(body.durationMinutes) && body.durationMinutes >= 1 && body.durationMinutes <= 600 ? body.durationMinutes : null;
      const upload = typeof body.uploadMinutes === "number" && Number.isInteger(body.uploadMinutes) && body.uploadMinutes >= 0 && body.uploadMinutes <= 120 ? body.uploadMinutes : null;
      const opensAt = isoTime(body.opensAt);
      const closesAt = isoTime(body.closesAt);
      if (duration === null || upload === null) return NextResponse.json({ error: "Writing and upload minutes must be whole numbers." }, { status: 400, headers: noStore });
      if (!opensAt || !closesAt || Date.parse(closesAt) <= Date.parse(opensAt)) return NextResponse.json({ error: "Needs an opening time before the closing time." }, { status: 400, headers: noStore });
      const raw = Array.isArray(body.questions) ? (body.questions as Row[]) : [];
      if (!raw.length || raw.length > 80) return NextResponse.json({ error: "Needs 1 to 80 questions." }, { status: 400, headers: noStore });
      const questions: QIn[] = [];
      for (let i = 0; i < raw.length; i++) {
        const q = readQuestion(raw[i], i + 1);
        if (typeof q === "string") return NextResponse.json({ error: q }, { status: 400, headers: noStore });
        questions.push(q);
      }

      const where = await place(sb, level, subject);
      if (where.classes.length !== 1 || where.subjects.length !== 1) return NextResponse.json({ error: `Couldn't find exactly one class for ${level} and one subject for ${subject}.`, where }, { status: 409, headers: noStore });

      // The same test sent twice (a retry) is not added twice.
      const same = await sb.from("tests").select("id,status,test_code").eq("title", title);
      if (same.error) throw new Error(same.error.message);
      const sameRows = (same.data ?? []) as Row[];
      if (sameRows.length && body.replace !== true) return NextResponse.json({ error: "A test with that name already exists.", there: sameRows.map((r) => r.id) }, { status: 409, headers: noStore });

      // A published test is corrected in place (same code, still published, no second announcement),
      // but only while no student has started it: their answers must never be lost.
      const live = sameRows.filter((r) => r.status !== "draft");
      if (live.length > 1) return NextResponse.json({ error: "More than one published test has that name." }, { status: 409, headers: noStore });
      if (live.length === 1) {
        const liveId = live[0].id as string;
        const subs = await sb.from("submissions").select("id", { count: "exact", head: true }).eq("test_id", liveId);
        if (subs.error) throw new Error(subs.error.message);
        if ((subs.count ?? 0) > 0) return NextResponse.json({ error: "Students have already started this test, so it can't be changed here." }, { status: 409, headers: noStore });
        const upd = await sb.from("tests").update({ duration_minutes: duration, upload_minutes: upload, class_id: where.classes[0].id, subject_id: where.subjects[0].id, subject: where.subjects[0].name, opens_at: opensAt, closes_at: closesAt }).eq("id", liveId);
        if (upd.error) throw new Error(upd.error.message);
        const old = await sb.from("questions").delete().eq("test_id", liveId);
        if (old.error) throw new Error(old.error.message);
        const qIds = questions.map(() => randomUUID());
        const qi = await sb.from("questions").insert(questions.map((q, i) => ({
          id: qIds[i], test_id: liveId, type: q.type, prompt: q.prompt, marks: q.marks, topic: q.topic,
          options: q.type === "mcq" ? q.options : null, max_length: null, show_counter: null,
          attachment_urls: q.type === "photo" ? q.attachments : [], sort_order: i,
        })));
        if (qi.error) throw new Error(qi.error.message);
        const keys = questions.flatMap((q, i) => (q.type === "mcq" ? [{ question_id: qIds[i], correct_index: q.correctIndex }] : []));
        if (keys.length) {
          const ki = await sb.from("question_keys").insert(keys);
          if (ki.error) throw new Error(ki.error.message);
        }
        await touchKey(sb, `test updated: ${title}`).catch(() => {});
        const total = questions.reduce((s, q) => s + q.marks, 0);
        return NextResponse.json({ id: liveId, testCode: live[0].test_code, status: live[0].status, updated: true, total, questions: questions.length, class: where.classes[0].name, subject: where.subjects[0].name }, { headers: noStore });
      }
      for (const r of sameRows) {
        const del = await sb.from("tests").delete().eq("id", r.id as string).eq("status", "draft");
        if (del.error) throw new Error(del.error.message);
      }

      const id = randomUUID();
      const row = {
        id,
        title,
        subject: where.subjects[0].name,
        duration_minutes: duration,
        upload_minutes: upload,
        cohort_id: null,
        class_id: where.classes[0].id,
        subject_id: where.subjects[0].id,
        opens_at: opensAt,
        closes_at: closesAt,
        status: "draft",
        created_at: new Date().toISOString(),
      };
      // Test codes are unique: try a few.
      let made = false;
      let code = "";
      for (let tries = 0; tries < 5 && !made; tries++) {
        code = `NEW-${randomInt(1000, 10000)}`;
        const ins = await sb.from("tests").insert({ ...row, test_code: code });
        if (!ins.error) made = true;
        else if (!/duplicate|unique/i.test(ins.error.message)) throw new Error(ins.error.message);
      }
      if (!made) throw new Error("Couldn't find a free test code.");

      try {
        const qIds = questions.map(() => randomUUID());
        const qRows = questions.map((q, i) => ({
          id: qIds[i],
          test_id: id,
          type: q.type,
          prompt: q.prompt,
          marks: q.marks,
          topic: q.topic,
          options: q.type === "mcq" ? q.options : null,
          max_length: null,
          show_counter: null,
          attachment_urls: q.type === "photo" ? q.attachments : [],
          sort_order: i,
        }));
        const qi = await sb.from("questions").insert(qRows);
        if (qi.error) throw new Error(qi.error.message);
        // Keys after their questions (the key row points at the question).
        const keys = questions.flatMap((q, i) => (q.type === "mcq" ? [{ question_id: qIds[i], correct_index: q.correctIndex }] : []));
        if (keys.length) {
          const ki = await sb.from("question_keys").insert(keys);
          if (ki.error) throw new Error(ki.error.message);
        }
      } catch (e) {
        // Never leave a half-made test behind.
        await sb.from("tests").delete().eq("id", id).eq("status", "draft");
        throw e;
      }

      await touchKey(sb, `test draft: ${title}`).catch(() => {});
      const total = questions.reduce((s, q) => s + q.marks, 0);
      return NextResponse.json({ id, testCode: code, status: "draft", total, questions: questions.length, class: where.classes[0].name, subject: where.subjects[0].name }, { headers: noStore });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400, headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500, headers: noStore });
  }
}
