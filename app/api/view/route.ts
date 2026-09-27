import { type NextRequest, NextResponse } from "next/server";
import { verifyViewUrl } from "@/lib/signed-view";

/**
 * Streams a note INLINE for reading in the portal.
 *
 * Only reachable with a signature minted by /api/notes/view-url, which checks
 * the caller may see that note. The link dies after a few minutes, so copying
 * it out of the page buys nothing. Unlike /api/download this never sends
 * Content-Disposition: attachment — there is no download path for notes.
 */
export const runtime = "nodejs";

const ALLOWED_HOST = "res.cloudinary.com";

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

  let parsed: URL;
  try {
    parsed = new URL(payload.u);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }
  if (parsed.hostname !== ALLOWED_HOST) return new NextResponse("URL not allowed", { status: 403 });

  const parts = parseCloudinaryUrl(payload.u);
  if (!parts) return new NextResponse("Invalid Cloudinary URL", { status: 400 });

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return new NextResponse("Server misconfigured", { status: 500 });

  const params = new URLSearchParams({ public_id: parts.publicId, type: "upload" });
  if (parts.format) params.set("format", parts.format);

  const upstream = await fetch(
    `https://api.cloudinary.com/v1_1/${parts.cloud}/${parts.resourceType}/download?${params}`,
    { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` } },
  );
  if (!upstream.ok) return new NextResponse(`Upstream error ${upstream.status}`, { status: 502 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${payload.n.replace(/"/g, "")}"`,
      // Never cached by a shared proxy, and gone from the browser quickly.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
