import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadNoteText, searchPages, searchTerms, type SearchHit } from "@/lib/note-text";
import { isHidden } from "@/lib/notes-library";

/**
 * Search inside every note this person may read.
 *
 * The caller's own sign-in is used to list the notes, so row-level security
 * decides what is searched: a student never gets a line from a note that
 * isn't theirs. Returns the best pages with a short snippet each.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const terms = searchTerms(q);
  if (!terms.length) return NextResponse.json({ hits: [] });

  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = (user.user.app_metadata as { role?: string } | undefined)?.role === "admin";

  const { data: notes, error } = await sb.from("notes").select("id, file_type").limit(1000);
  if (error) return NextResponse.json({ error: "could not list notes" }, { status: 500 });
  const ids = (notes ?? []).filter((n) => admin || !isHidden(String(n.file_type ?? ""))).map((n) => String(n.id));

  const hits: SearchHit[] = [];
  for (let i = 0; i < ids.length; i += 16) {
    const batch = ids.slice(i, i + 16);
    const texts = await Promise.all(batch.map((id) => loadNoteText(id)));
    batch.forEach((id, j) => {
      const t = texts[j];
      if (t) hits.push(...searchPages(id, t, q, terms));
    });
  }
  // Best pages first, at most 4 pages from any one note, 40 in all.
  hits.sort((a, b) => b.score - a.score || a.page - b.page);
  const per = new Map<string, number>();
  const out = hits.filter((h) => {
    const n = per.get(h.noteId) ?? 0;
    per.set(h.noteId, n + 1);
    return n < 4;
  });
  return NextResponse.json(
    { hits: out.slice(0, 40).map(({ noteId, page, snippet }) => ({ noteId, page, snippet })), more: out.length > 40 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
