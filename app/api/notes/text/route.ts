import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { loadNoteText, saveNoteText } from "@/lib/note-text";

/**
 * Admin only. POST saves the words inside a note (read from the PDF in the
 * admin's browser at upload) so students can search inside it. GET ?ids=
 * says which notes already have them, for "Make older notes searchable".
 */
export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_CHARS = 3_000_000;

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { noteId?: unknown; pages?: unknown } | null;
  const noteId = typeof body?.noteId === "string" && UUID.test(body.noteId) ? body.noteId : null;
  const pages = Array.isArray(body?.pages) ? body.pages.map((p) => (typeof p === "string" ? p : "")).slice(0, 600) : null;
  if (!noteId || !pages) return NextResponse.json({ error: "noteId and pages required" }, { status: 400 });
  if (pages.reduce((n, p) => n + p.length, 0) > MAX_CHARS) return NextResponse.json({ error: "too long" }, { status: 413 });
  try {
    await saveNoteText(noteId, pages);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter((id) => UUID.test(id)).slice(0, 400);
  const have: string[] = [];
  // A few at a time: kind to Cloudinary, still quick.
  for (let i = 0; i < ids.length; i += 12) {
    const batch = ids.slice(i, i + 12);
    const got = await Promise.all(batch.map((id) => loadNoteText(id)));
    batch.forEach((id, j) => got[j] && have.push(id));
  }
  return NextResponse.json({ have }, { headers: { "Cache-Control": "private, no-store" } });
}
