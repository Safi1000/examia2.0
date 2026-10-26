import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest } from "@/lib/admin-auth";
import type { ResultPayload } from "@/lib/diagnostic/logic";
import { diagnosticStatus } from "@/lib/diagnostic/status-server";
import { pushReady, serviceClient } from "@/lib/push-server";

/**
 * POST: a student finishes the Starting Point Check. Each result is its own
 * small file in a private Supabase Storage bucket ("diagnostics"), under
 * start/ or end/, so no database change is needed and nothing overwrites.
 * Only accepted while Hamza has the check open.
 * GET (admin): every result, newest first.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "diagnostics";
const MAX_BYTES = 200_000;

async function ensureBucket(sb: ReturnType<typeof serviceClient>) {
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
}

export async function POST(req: NextRequest) {
  if (!pushReady()) return NextResponse.json({ error: "not set up" }, { status: 503 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let p: ResultPayload;
  try {
    p = JSON.parse(text) as ResultPayload;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!p || typeof p.name !== "string" || !Array.isArray(p.tracks) || !p.summary) return NextResponse.json({ error: "bad request" }, { status: 400 });
  // Someone part-way through when Hamza closed it may still finish: allow a
  // result that started while open (within the last 3 hours).
  const status = await diagnosticStatus();
  const recent = p.startedAt && Date.now() - Date.parse(p.startedAt) < 3 * 3600_000;
  if (!status.open && !recent) return NextResponse.json({ error: "closed" }, { status: 403 });
  const kind = p.kind === "end" ? "end" : "start";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sb = serviceClient();
  await ensureBucket(sb);
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(`${kind}/${id}.json`, new Blob([JSON.stringify({ ...p, kind, name: p.name.slice(0, 80), id, savedAt: new Date().toISOString() })], { type: "application/json" }), {
      contentType: "application/json",
    });
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ results: [] });
  const sb = serviceClient();
  await ensureBucket(sb);
  const all = await Promise.all(
    (["start", "end"] as const).map(async (folder) => {
      const { data: files } = await sb.storage.from(BUCKET).list(folder, { limit: 1000, sortBy: { column: "name", order: "desc" } });
      return Promise.all(
        (files ?? [])
          .filter((f) => f.name.endsWith(".json"))
          .map(async (f) => {
            const { data } = await sb.storage.from(BUCKET).download(`${folder}/${f.name}`);
            try {
              return data ? (JSON.parse(await data.text()) as ResultPayload & { id: string; savedAt: string }) : null;
            } catch {
              return null;
            }
          }),
      );
    }),
  );
  // Hamza's report notes, saved beside each result (see /api/diagnostic/notes).
  const { data: noteFiles } = await sb.storage.from(BUCKET).list("notes", { limit: 1000 });
  const notes: Record<string, unknown> = {};
  await Promise.all(
    (noteFiles ?? [])
      .filter((f) => f.name.endsWith(".json"))
      .map(async (f) => {
        const { data } = await sb.storage.from(BUCKET).download(`notes/${f.name}`);
        try {
          if (data) notes[f.name.replace(/\.json$/, "")] = JSON.parse(await data.text());
        } catch {}
      }),
  );
  const results = all
    .flat()
    .filter(Boolean)
    .map((r) => ({ ...r!, notes: notes[r!.id] ?? null }))
    .sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
