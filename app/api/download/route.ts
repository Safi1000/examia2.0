import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST = "res.cloudinary.com";

function parseCloudinaryUrl(url: string) {
  // https://res.cloudinary.com/{cloud}/{resource_type}/upload/v{version}/{public_id}
  const match = url.match(/res\.cloudinary\.com\/([^/]+)\/([^/]+)\/upload\/(?:v\d+\/)?(.+)/);
  if (!match) return null;
  return { cloud: match[1], resourceType: match[2], publicId: match[3] };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (parsed.hostname !== ALLOWED_HOST)
    return new NextResponse("URL not allowed", { status: 403 });

  const parts = parseCloudinaryUrl(url);
  if (!parts) return new NextResponse("Invalid Cloudinary URL", { status: 400 });

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !apiSecret) return new NextResponse("Server misconfigured", { status: 500 });

  // Cloudinary Admin API download — works even when the CDN blocks PDF delivery
  const adminUrl = `https://api.cloudinary.com/v1_1/${parts.cloud}/${parts.resourceType}/download?public_id=${encodeURIComponent(parts.publicId)}&type=upload`;

  const upstream = await fetch(adminUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
    },
  });

  if (!upstream.ok) {
    return new NextResponse(`Upstream error ${upstream.status}`, { status: 502 });
  }

  const fileName = parts.publicId.split("/").pop() ?? "download";
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
