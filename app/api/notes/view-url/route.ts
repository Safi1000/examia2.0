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

  const { data: note, error } = await sb
    .from("notes")
    .select("file_url, file_name, file_type")
    .eq("id", noteId)
    .single();
  if (error || !note?.file_url) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    url: signViewUrl(note.file_url as string, (note.file_name as string) ?? "note"),
    fileType: note.file_type ?? "application/octet-stream",
  });
}
