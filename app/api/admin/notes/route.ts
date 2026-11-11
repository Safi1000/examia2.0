import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";

/**
 * Hamza's private note per student (Today and the roster page).
 *
 * GET (admin): every note, as { notes: { [studentId]: { text, updatedAt } } }.
 * PUT (admin): { studentId, text } saves one note; blank text removes it.
 *
 * One JSON file in a private Supabase Storage bucket ("teacher", notes.json),
 * read and written only here with the server key. Students can never reach it:
 * it is not in their account, not in the students table, and the bucket is private.
 * No database change was needed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "teacher";
const FILE = "notes.json";
/** A note is a reminder, not an essay. */
const TEXT_MAX = 600;
/** The request body: one note plus a little JSON around it. */
const BODY_MAX = 4_000;
/** Notes kept in the file, so it can never grow without end. */
const NOTES_CAP = 3_000;

type TeacherNote = { text: string; updatedAt: string };
type NotesFile = { v: 1; notes: Record<string, TeacherNote> };

const noStore = { "Cache-Control": "private, no-store" };
const storageReady = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const isId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);

type Sb = ReturnType<typeof serviceClient>;
let bucketReady = false;
async function ensureBucket(sb: Sb) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
  bucketReady = true;
}

async function readNotes(sb: Sb): Promise<NotesFile> {
  const { data } = await sb.storage.from(BUCKET).download(FILE);
  if (!data) return { v: 1, notes: {} };
  try {
    const v = JSON.parse(await data.text()) as NotesFile;
    return v && v.notes && typeof v.notes === "object" ? v : { v: 1, notes: {} };
  } catch {
    return { v: 1, notes: {} };
  }
}

/** Writes in this server one at a time, so two quick saves never overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!storageReady()) return NextResponse.json({ notes: {}, ready: false }, { headers: noStore });
  const sb = serviceClient();
  await ensureBucket(sb);
  // Wait for any save still on its way, so a reload straight after one shows it.
  await queue;
  const file = await readNotes(sb);
  return NextResponse.json({ notes: file.notes, ready: true }, { headers: noStore });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!storageReady()) return NextResponse.json({ error: "Notes aren't set up on the server yet." }, { status: 503, headers: noStore });
  const raw = await req.text().catch(() => "");
  if (raw.length > BODY_MAX) return NextResponse.json({ error: "That note is too long." }, { status: 413, headers: noStore });
  let body: { studentId?: unknown; text?: unknown } | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as { studentId?: unknown; text?: unknown };
  } catch {}
  if (!body || !isId(body.studentId) || (body.text !== undefined && typeof body.text !== "string")) {
    return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  }
  const studentId = body.studentId;
  const text = String(body.text ?? "").trim().slice(0, TEXT_MAX);

  const sb = serviceClient();
  await ensureBucket(sb);
  try {
    const saved = await serial(async () => {
      const file = await readNotes(sb);
      let note: TeacherNote | null = null;
      if (!text) delete file.notes[studentId];
      else {
        if (!file.notes[studentId] && Object.keys(file.notes).length >= NOTES_CAP) throw new Error("full");
        note = { text, updatedAt: new Date().toISOString() };
        file.notes[studentId] = note;
      }
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(FILE, new Blob([JSON.stringify(file)], { type: "application/json" }), { contentType: "application/json", upsert: true });
      if (error) throw new Error(error.message);
      return note;
    });
    return NextResponse.json({ ok: true, note: saved }, { headers: noStore });
  } catch (err) {
    console.error("[notes] save", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save the note. Try again." }, { status: 500, headers: noStore });
  }
}
