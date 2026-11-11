import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

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

/**
 * The payload is sealed (AES-256-GCM), not just signed: a signed-only payload
 * is plain base64, and decoding it gave anyone holding a view link the note's
 * permanent Cloudinary address.
 */
const sealKey = () => createHash("sha256").update(`ht-view-link:${secret()}`).digest();
function seal(payload: ViewPayload): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(payload), "utf8"), c.final()]);
  return b64url(Buffer.concat([iv, c.getAuthTag(), body]));
}
function unseal(data: string): ViewPayload {
  const buf = Buffer.from(data, "base64url");
  const d = createDecipheriv("aes-256-gcm", sealKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8")) as ViewPayload;
}

export interface ViewPayload {
  /** Cloudinary URL to stream. */
  u: string;
  /** Display name. */
  n: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** True for a download link (/api/download); absent for view links. */
  a?: true;
  /**
   * Owner: the student's user id. When set, /api/view also wants that
   * student's sign-in with the request, so a copied link is useless to anyone
   * else. Left out where the file is read by something that can't send it
   * (Microsoft's Office viewer, an <img>, the teacher's search indexing).
   */
  o?: string;
}

export function signViewUrl(url: string, name: string, owner?: string): string {
  const data = seal({ u: url, n: name, exp: Date.now() + TTL_MS, ...(owner ? { o: owner } : {}) });
  const sig = b64url(createHmac("sha256", secret()).update(data).digest());
  return `/api/view?d=${data}&s=${sig}`;
}

/**
 * A signed download link (e.g. the parent's report PDF). Signed server-side by
 * the page that already proved access, so /api/download is no longer an open
 * proxy that anyone could point at any file.
 */
export function signDownloadUrl(url: string, name: string, ttlMs = 60 * 60_000): string {
  const data = seal({ u: url, n: name, exp: Date.now() + ttlMs, a: true });
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
    let payload: ViewPayload;
    try {
      payload = unseal(data);
    } catch {
      // A link minted before sealing (still signed, so only ours): fine until it expires.
      payload = JSON.parse(Buffer.from(data, "base64url").toString()) as ViewPayload;
    }
    if (!payload?.u || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
