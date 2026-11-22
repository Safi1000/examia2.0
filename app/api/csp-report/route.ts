import { NextResponse } from "next/server";

/**
 * POST: a browser reporting a script the report only content security policy
 * (next.config.ts) would have blocked. Nothing is stored: one short line goes
 * to the server log, searchable in Vercel as "CSP report".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A real report is well under a kilobyte or two. */
const MAX_BODY = 8_000;

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw && raw.length <= MAX_BODY) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const r = (parsed && typeof parsed === "object" && "csp-report" in parsed ? (parsed as Record<string, unknown>)["csp-report"] : parsed) as Record<string, unknown> | null;
      if (r && typeof r === "object") {
        const pick = (k: string) => String(r[k] ?? "").slice(0, 200);
        // Page address without its query, so nothing personal lands in the log.
        const page = pick("document-uri").split("?")[0];
        console.warn("CSP report", JSON.stringify({ page, blocked: pick("blocked-uri").split("?")[0], directive: pick("violated-directive") || pick("effective-directive"), source: pick("source-file").split("?")[0], line: r["line-number"] ?? null }));
      }
    } catch {}
  }
  return new NextResponse(null, { status: 204 });
}
