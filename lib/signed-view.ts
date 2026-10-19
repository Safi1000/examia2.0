import { createHmac, timingSafeEqual } from "crypto";

/**
 * Short-lived signed links for viewing a file in the portal.
 *
 * Notes are read inside the app, never downloaded, so the Cloudinary URL must
 * not be something a student can copy out of the page and pass around. A view
 * link is signed server-side and expires in minutes: after that it is dead, and
 * without the secret nobody can mint another.
 */

const TTL_MS = 10 * 60_000;

function secret(): string {
  const s = process.env.CLOUDINARY_API_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("No signing secret configured");
  return s;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export interface ViewPayload {
  /** Cloudinary URL to stream. */
  u: string;
  /** Display name. */
  n: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** True for a download link (/api/download); absent for view links. */
  a?: true;
}

export function signViewUrl(url: string, name: string): string {
  const payload: ViewPayload = { u: url, n: name, exp: Date.now() + TTL_MS };
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(data).digest());
  return `/api/view?d=${data}&s=${sig}`;
}

/**
 * A signed download link (e.g. the parent's report PDF). Signed server-side by
 * the page that already proved access, so /api/download is no longer an open
 * proxy that anyone could point at any file.
 */
export function signDownloadUrl(url: string, name: string, ttlMs = 60 * 60_000): string {
  const payload: ViewPayload = { u: url, n: name, exp: Date.now() + ttlMs, a: true };
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(data).digest());
  return `/api/download?d=${data}&s=${sig}`;
}

/** Only this site's own Cloudinary account may be streamed. */
export function isOwnCloudinary(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return false;
    const own = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD;
    return !own || u.pathname.split("/")[1] === own;
  } catch {
    return false;
  }
}

/** A filename safe to put in a Content-Disposition header. */
export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

/** Returns the payload when the signature is valid and unexpired, else null. */
export function verifyViewUrl(data: string, sig: string): ViewPayload | null {
  let expected: Buffer;
  try {
    expected = Buffer.from(b64url(createHmac("sha256", secret()).update(data).digest()));
  } catch {
    return null;
  }
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as ViewPayload;
    if (!payload?.u || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
