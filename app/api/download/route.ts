import { type NextRequest, NextResponse } from "next/server";
import { isOwnCloudinary, safeFileName, verifyViewUrl } from "@/lib/signed-view";

/**
 * Downloads one file as an attachment. Only reachable with a short-lived link
 * signed by a page that already checked access (today: the parent report page,
 * via signDownloadUrl). Before the 2026-10-16 audit this took any ?url= and
 * fetched it with the Cloudinary admin key, unauthenticated.
 */
export const runtime = "nodejs";

function parseCloudinaryUrl(url: string) {
  // https://res.cloudinary.com/{cloud}/{resource_type}/upload/v{version}/{public_id.ext}
  const match = url.match(/res\.cloudinary\.com\/([^/]+)\/([^/]+)\/upload\/(?:v\d+\/)?(.+)/);
  if (!match) return null;
  const [, cloud, resourceType, fullId] = match;
  // image resources: public_id has no extension, so pass it as the format param.
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
  if (!payload || !payload.a) return new NextResponse("Link expired", { status: 403 });
  if (!isOwnCloudinary(payload.u)) return new NextResponse("URL not allowed", { status: 403 });

  const parts = parseCloudinaryUrl(payload.u);
  if (!parts) return new NextResponse("Invalid Cloudinary URL", { status: 400 });

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return new NextResponse("Server misconfigured", { status: 500 });

  const params = new URLSearchParams({ public_id: parts.publicId, type: "upload", attachment: "true" });
  if (parts.format) params.set("format", parts.format);

  const upstream = await fetch(
    `https://api.cloudinary.com/v1_1/${parts.cloud}/${parts.resourceType}/download?${params}`,
    { headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` } },
  );
  if (!upstream.ok) return new NextResponse("Could not fetch the file", { status: 502 });

  const disposition = req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${safeFileName(payload.n)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
