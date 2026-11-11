import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOwnCloudinary, safeFileName, verifyViewUrl } from "@/lib/signed-view";

const RISKY = /^\s*(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

/**
 * Streams a note INLINE for reading in the portal.
 *
 * Only reachable with a signature minted by /api/notes/view-url, which checks
 * the caller may see that note. The link dies after a few minutes, and a
 * student's PDF link also needs that student's own sign-in with the request. Unlike /api/download this never sends
 * Content-Disposition: attachment — there is no download path for notes.
 */
export const runtime = "nodejs";

/** The signed-in user's id from the request's Supabase token, or null. Asked of Supabase, so a made-up or expired token never passes. */
async function userIdFromRequest(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await sb.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function parseCloudinaryUrl(url: string) {
  const match = url.match(/res\.cloudinary\.com\/([^/]+)\/([^/]+)\/upload\/(?:v\d+\/)?(.+)/);
  if (!match) return null;
  const [, cloud, resourceType, fullId] = match;
  if (resourceType === "image") {
    const dot = fullId.lastIndexOf(".");
    return {
      cloud,
      resourceType,
      publicId: dot !== -1 ? fullId.slice(0, dot) : fullId,
      format: dot !== -1 ? fullId.slice(dot + 1) : undefined,
    };
  }
  return { cloud, resourceType, publicId: fullId, format: undefined };
}

export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("d");
  const sig = req.nextUrl.searchParams.get("s");
  if (!data || !sig) return new NextResponse("Missing signature", { status: 400 });

  const payload = verifyViewUrl(data, sig);
  if (!payload) return new NextResponse("Link expired", { status: 403 });

  // A link minted for one student (their PDFs) also needs that student's
  // sign-in: copied out of the page, it opens nothing for anyone else.
  if (payload.o) {
    const uid = await userIdFromRequest(req);
    if (!uid) return new NextResponse("Sign in to read this note", { status: 401, headers: { "Cache-Control": "private, no-store" } });
    if (uid !== payload.o) return new NextResponse("Not allowed", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  if (!isOwnCloudinary(payload.u)) return new NextResponse("URL not allowed", { status: 403 });

  const parts = parseCloudinaryUrl(payload.u);
  if (!parts) return new NextResponse("Invalid Cloudinary URL", { status: 400 });

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return new NextResponse("Server misconfigured", { status: 500 });

  const params = new URLSearchParams({ public_id: parts.publicId, type: "upload" });
  if (parts.format) params.set("format", parts.format);

  // Cloudinary gets 20 seconds to start answering; after that the reader is
  // told, not left on a blank page. The file itself may take as long as it needs.
  const gate = new AbortController();
  const slow = setTimeout(() => gate.abort(), 20_000);
  let upstream: Response;
  try {
    upstream = await fetch(
      `https://api.cloudinary.com/v1_1/${parts.cloud}/${parts.resourceType}/download?${params}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` }, signal: gate.signal },
    );
  } catch {
    return new NextResponse("Could not fetch the file", { status: 502 });
  } finally {
    clearTimeout(slow);
  }
  if (!upstream.ok) return new NextResponse("Could not fetch the file", { status: 502 });

  // The size lets the reader show how far a big file has come. Only when the
  // bytes arrive as sent: a compressed reply is unpacked on the way, so its
  // stated size would be wrong and cut the file short.
  const size = upstream.headers.get("content-length");
  const encoded = (upstream.headers.get("content-encoding") ?? "identity").toLowerCase() !== "identity";
  const length: Record<string, string> = size && /^\d+$/.test(size) && !encoded ? { "Content-Length": size } : {};

  return new NextResponse(upstream.body, {
    headers: {
      ...length,
      // A page or drawing (HTML, SVG, XML) would run as part of this site: never shown, only as plain bytes.
      "Content-Type": RISKY.test(upstream.headers.get("content-type") ?? "") ? "application/octet-stream" : (upstream.headers.get("content-type") ?? "application/octet-stream"),
      "Content-Disposition": `${RISKY.test(upstream.headers.get("content-type") ?? "") ? "attachment" : "inline"}; filename="${safeFileName(payload.n)}"`,
      // Never cached by a shared proxy, and gone from the browser quickly.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
