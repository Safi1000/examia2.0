import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hamza's Google account, server side only: Calendar makes each class's Meet
 * link, Drive finds and shares the recording. Plain REST calls, no SDK.
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see DEVELOPER-HANDOFF.md).
 * The refresh token lives in the server-only google_account table.
 */

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  // Full Drive, because the recordings are files Meet made, not this app.
  "https://www.googleapis.com/auth/drive",
];

export const googleReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

// ---- OAuth -----------------------------------------------------------------

/** A short-lived signed state, so only a flow an admin started can connect. */
function sign(v: string) {
  return createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET!).update(v).digest("base64url");
}
export function makeState(): string {
  const ts = String(Date.now());
  return `${ts}.${sign(ts)}`;
}
export function checkState(state: string | null): boolean {
  if (!state) return false;
  const [ts, sig] = state.split(".");
  if (!ts || !sig || Date.now() - Number(ts) > 10 * 60_000) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(ts));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authUrl(origin: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: makeState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function exchangeCode(code: string, origin: string): Promise<{ refreshToken: string; email: string | null }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as { refresh_token?: string; id_token?: string; error?: string };
  if (!res.ok || !j.refresh_token) throw new Error(j.error ?? "no refresh token");
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from(j.id_token!.split(".")[1], "base64url").toString()).email ?? null;
  } catch {}
  return { refreshToken: j.refresh_token, email };
}

/** A fresh access token for the connected account, or null if not connected. */
export async function accessToken(sb: SupabaseClient): Promise<string | null> {
  if (!googleReady()) return null;
  const { data } = await sb.from("google_account").select("refresh_token").eq("id", 1).maybeSingle();
  if (!data?.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: data.refresh_token as string,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

async function g<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// ---- Calendar: one event (and Meet link) per class ---------------------------

interface CalEvent {
  id: string;
  hangoutLink?: string;
  attachments?: Array<{ fileId?: string; fileUrl?: string; mimeType?: string; title?: string }>;
}

export async function createClassEvent(token: string, title: string, startIso: string, endIso: string) {
  const ev = await g<CalEvent>(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST",
    body: JSON.stringify({
      summary: title,
      start: { dateTime: startIso, timeZone: "Asia/Karachi" },
      end: { dateTime: endIso, timeZone: "Asia/Karachi" },
      reminders: { useDefault: false, overrides: [] },
      conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  return { eventId: ev.id, meetUrl: ev.hangoutLink ?? null };
}

export const getEvent = (token: string, id: string) =>
  g<CalEvent>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`);

// ---- Drive: find the recording and share it with "anyone with the link" -----

export async function findRecording(token: string, ev: CalEvent, title: string, afterIso: string): Promise<string | null> {
  // Meet attaches the recording to the Calendar event...
  let fileId = ev.attachments?.find((a) => a.mimeType?.startsWith("video/"))?.fileId ?? null;
  // ...and also names the Drive file after the event, so search as a fallback.
  if (!fileId) {
    const q = `mimeType contains 'video/' and trashed = false and createdTime > '${afterIso}' and name contains '${title.replace(/'/g, "\\'")}'`;
    const list = await g<{ files: Array<{ id: string }> }>(
      token,
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime&pageSize=1`,
    );
    fileId = list.files[0]?.id ?? null;
  }
  if (!fileId) return null;
  await g(token, `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }).catch(() => null); // Already shared is fine.
  const f = await g<{ webViewLink?: string }>(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`);
  return f.webViewLink ?? null;
}
