import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signViewUrl } from "@/lib/signed-view";

/**
 * Mints a short-lived view link for one note.
 *
 * The caller's Supabase JWT is used for the lookup, so row-level security
 * decides whether they may see that note — a student who was never assigned it
 * gets nothing back, and nobody ever handles the raw Cloudinary URL.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  const { noteId } = (await req.json().catch(() => ({}))) as { noteId?: string };
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: user } = await sb.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Row-level security decides whether they may see the note; the raw file
  // link lives in an admin-only table and comes back only through
  // note_file_url(), which repeats that check.
  const [{ data: note, error }, link] = await Promise.all([
    sb.from("notes").select("*").eq("id", noteId).single(),
    sb.rpc("note_file_url", { p_note_id: noteId }),
  ]);
  // Until migration 20261020010000 is applied the link is still on the notes row.
  const fileUrl = link.error?.code === "PGRST202" ? (note?.file_url as string | null) : link.data;
  if (error || !note || !fileUrl) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    url: signViewUrl(fileUrl as string, (note.file_name as string) ?? "note"),
    fileType: note.file_type ?? "application/octet-stream",
  });
}
