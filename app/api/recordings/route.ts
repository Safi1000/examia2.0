import { type NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";
import { GoogleBusy, accessToken, googleReady, recordingsFolderUrl } from "@/lib/google";
import {
  closeOne,
  continueCatchUp,
  deleteOne,
  endCatchUp,
  openOne,
  readAccess,
  refreshLinks,
  retryFailed,
  startCatchUp,
  sweepAccess,
} from "@/lib/recordings-server";
import { viewOf, type AccessFile } from "@/lib/recording-access";

/**
 * Hamza's Recordings page (teacher only).
 *
 * GET: the open and closed state (catch-up window, per-recording overrides,
 *      what is still being opened or closed, when links were last refreshed).
 * POST { action, key?, keys? }:
 *   catchup-start     open every recording so far to current students for 48 hours
 *   catchup-continue  open the next batch in Drive (the page repeats until done)
 *   catchup-retry     put the ones Google refused back on the list
 *   catchup-close     end the window now, then close sharing in batches
 *   sweep             close the next batch of anything whose window has ended
 *   open / close      one recording: open for 48 hours, or close now
 *   refresh           give these recordings new links (a few per press)
 *
 * The state is a private JSON file in Supabase Storage (no database change).
 * Every Google step needs Hamza's connected Google account, so it runs here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const storageReady = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const isKey = (k: unknown): k is string => typeof k === "string" && /^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{1,64}\|[A-Za-z0-9_-]{1,64}$/.test(k);
const ACTIONS = ["catchup-start", "catchup-continue", "catchup-retry", "catchup-close", "sweep", "open", "close", "refresh", "delete", "folder"] as const;
type Action = (typeof ACTIONS)[number];

/** What the page needs, never the Drive file ids. */
function summarize(a: AccessFile, now: number) {
  const c = a.catchUp;
  return {
    ready: true,
    view: viewOf(a, now),
    catchUp: c
      ? {
          startedAt: c.startedAt,
          endsAt: c.endsAt,
          upTo: c.upTo,
          total: c.total,
          waiting: c.todo.length,
          failed: Object.entries(c.failed).map(([key, v]) => ({ key, why: v.why })),
        }
      : null,
    lastCatchUp: a.lastCatchUp ?? null,
    /** Opened from this page and not closed yet (closing waits for the window to end). */
    shared: Object.keys(a.shared),
    /** Google refused to close these at least once; the 15-minute job keeps trying. */
    stuck: Object.entries(a.shared).filter(([, s]) => (s.tries ?? 0) > 0).map(([k]) => k),
    refreshedAt: a.refreshedAt,
  };
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!storageReady()) return NextResponse.json({ ready: false }, { headers: noStore });
  const now = Date.now();
  try {
    return NextResponse.json({ ...summarize(await readAccess(serviceClient()), now), google: googleReady() }, { headers: noStore });
  } catch (e) {
    console.error("[recordings] read", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't load the recording settings. Try again." }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (!storageReady()) return NextResponse.json({ error: "This isn't set up on the server yet." }, { status: 503, headers: noStore });
  const raw = await req.text().catch(() => "");
  if (raw.length > 20_000) return NextResponse.json({ error: "bad request" }, { status: 413, headers: noStore });
  let body: { action?: unknown; key?: unknown; keys?: unknown } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {}
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  if ((action === "open" || action === "close" || action === "delete") && !isKey(body.key)) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
  const keys = Array.isArray(body.keys) ? body.keys.filter(isKey).slice(0, 400) : [];
  if (action === "refresh" && !keys.length) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });

  const sb = serviceClient();
  const now = Date.now();
  let token: string | null = null;
  try {
    token = await accessToken(sb);
  } catch (e) {
    if (e instanceof GoogleBusy) return NextResponse.json({ error: "Google is busy right now. Try again in a minute." }, { status: 503, headers: noStore });
    throw e;
  }
  // Starting, retrying and ending a window only change the file; everything else needs Google.
  const needsGoogle = !["catchup-start", "catchup-retry", "catchup-close", "delete"].includes(action);
  if (!token && needsGoogle)
    return NextResponse.json({ error: "Google isn't connected, so recordings can't be opened or closed. Connect it at the bottom of the Classes page." }, { status: 409, headers: noStore });

  try {
    switch (action) {
      case "catchup-start": {
        if (!token) return NextResponse.json({ error: "Google isn't connected. Connect it at the bottom of the Classes page first." }, { status: 409, headers: noStore });
        const a = await startCatchUp(sb, now);
        return NextResponse.json(summarize(a, now), { headers: noStore });
      }
      case "catchup-continue":
        return NextResponse.json(summarize(await continueCatchUp(sb, token!, now), now), { headers: noStore });
      case "catchup-retry":
        return NextResponse.json(summarize(await retryFailed(sb, now), now), { headers: noStore });
      case "catchup-close": {
        await endCatchUp(sb, now);
        // Close the first batch straight away; the page asks for the rest.
        const r = token ? await sweepAccess(sb, token, now, 35_000) : { access: await readAccess(sb), left: -1 };
        return NextResponse.json({ ...summarize(r.access, now), closing: r.left }, { headers: noStore });
      }
      case "sweep": {
        const r = await sweepAccess(sb, token!, now, 35_000);
        return NextResponse.json({ ...summarize(r.access, now), closing: r.left }, { headers: noStore });
      }
      case "open":
        return NextResponse.json(summarize(await openOne(sb, token!, body.key as string, now), now), { headers: noStore });
      case "close": {
        const r = await closeOne(sb, token!, body.key as string);
        return NextResponse.json({ ...summarize(r.access, now), closed: r.closed }, { headers: noStore });
      }
      case "delete": {
        const r = await deleteOne(sb, token, body.key as string);
        return NextResponse.json({ ...summarize(r.access, now), binned: r.binned }, { headers: noStore });
      }
      case "folder": {
        const url = await recordingsFolderUrl(token!);
        return NextResponse.json({ ...summarize(await readAccess(sb), now), folderUrl: url }, { headers: noStore });
      }
      case "refresh": {
        const r = await refreshLinks(sb, token!, keys, now);
        return NextResponse.json(
          { ...summarize(r.access, now), refreshed: r.refreshed, skipped: r.skipped, failed: r.failed, left: r.left },
          { headers: noStore },
        );
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[recordings]", action, msg.slice(0, 300));
    return NextResponse.json({ error: msg.startsWith("This recording") ? msg : "Google didn't answer properly. Try again." }, { status: 500, headers: noStore });
  }
}
