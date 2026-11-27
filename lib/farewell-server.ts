import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/seo";

/**
 * Server only. The farewell link Hamza sends a student who has left:
 * `${origin}/farewell/${studentId}.${signature}`. The signature is the first
 * 22 characters of base64url(HMAC-SHA256(studentId, secret)), so a link can't
 * be made up or edited to reach another student. It only lets someone send
 * that student's feedback note; it never signs anyone in.
 */

const SIG_LENGTH = 22;
const ID_RULE = /^[A-Za-z0-9_:-][A-Za-z0-9_.:-]{0,79}$/;

function secret(): string | null {
  return process.env.FAREWELL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function signature(studentId: string, key: string): string {
  return createHmac("sha256", key).update(studentId).digest("base64url").slice(0, SIG_LENGTH);
}

/** The token for a student, or null when the server has no secret to sign with. */
export function farewellToken(studentId: string): string | null {
  const key = secret();
  if (!key || !ID_RULE.test(studentId)) return null;
  return `${studentId}.${signature(studentId, key)}`;
}

/** The student id a token was made for, or null if it is malformed or forged. Constant-time compare. */
export function verifyFarewellToken(token: unknown): string | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 120) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const studentId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!ID_RULE.test(studentId) || given.length !== SIG_LENGTH) return null;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(signature(studentId, key), "utf8");
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? studentId : null;
}

/**
 * Where farewell links point: the live site's own address in production (so a
 * link made from a preview still reaches the real portal), else this request's
 * own origin (local development).
 */
export function farewellOrigin(req: NextRequest): string {
  return process.env.NODE_ENV === "production" ? SITE_URL : req.nextUrl.origin;
}

export function farewellUrl(origin: string, studentId: string): string | null {
  const t = farewellToken(studentId);
  return t ? `${origin}/farewell/${t}` : null;
}
