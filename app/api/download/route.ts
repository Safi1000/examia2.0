import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST = "res.cloudinary.com";

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

  // Insert fl_attachment after /upload/ so Cloudinary adds Content-Disposition: attachment
  const uploadIdx = url.indexOf("/upload/");
  const redirectUrl =
    uploadIdx !== -1
      ? url.slice(0, uploadIdx + 8) + "fl_attachment/" + url.slice(uploadIdx + 8)
      : url;

  return NextResponse.redirect(redirectUrl);
}
