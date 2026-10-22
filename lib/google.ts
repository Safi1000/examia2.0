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
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
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
      // A phone alert from Google Calendar 10 minutes before each class.
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
      conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  return { eventId: ev.id, meetUrl: ev.hangoutLink ?? null };
}

export const getEvent = (token: string, id: string) =>
  g<CalEvent>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`);

/** A class moved for one day: move its Calendar event (the Meet link stays the same). */
export const moveEvent = (token: string, id: string, startIso: string, endIso: string) =>
  g<CalEvent>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: startIso, timeZone: "Asia/Karachi" }, end: { dateTime: endIso, timeZone: "Asia/Karachi" } }),
  });

/** A class cancelled for one day: remove its Calendar event and alert. */
export async function deleteEvent(token: string, id: string) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google ${res.status}`);
}

// ---- Drive: find the recording, file it, share it for a day -----------------

/** Recordings live in "Hamza Teaches recordings / <level> / <subject>" in Hamza's Drive. */
export const RECORDINGS_ROOT = "Hamza Teaches recordings";
const FOLDER = "application/vnd.google-apps.folder";

/**
 * Find (or make) a folder path. Folders are tagged with a hidden property, so
 * Hamza can rename or move them in Drive and they're still found.
 */
async function folderPath(token: string, path: string[]): Promise<string> {
  let parent: string | null = null;
  for (let i = 0; i < path.length; i++) {
    const tag = path.slice(0, i + 1).join("/").replace(/'/g, "");
    const q = `mimeType = '${FOLDER}' and trashed = false and appProperties has { key='htPath' and value='${tag}' }`;
    const found = await g<{ files: Array<{ id: string }> }>(
      token,
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    );
    parent =
      found.files[0]?.id ??
      (
        await g<{ id: string }>(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
          method: "POST",
          body: JSON.stringify({ name: path[i], mimeType: FOLDER, appProperties: { htPath: tag }, ...(parent ? { parents: [parent] } : {}) }),
        })
      ).id;
  }
  return parent!;
}

/** Move a file into a folder (out of "Meet Recordings"). */
async function moveInto(token: string, fileId: string, folderId: string) {
  const f = await g<{ parents?: string[] }>(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`);
  if (f.parents?.includes(folderId)) return;
  const q = new URLSearchParams({ addParents: folderId, removeParents: (f.parents ?? []).join(","), fields: "id" });
  await g(token, `https://www.googleapis.com/drive/v3/files/${fileId}?${q}`, { method: "PATCH", body: "{}" });
}

/**
 * The class recording, or null if Meet hasn't saved it yet. When found it is
 * filed into `folder` and, if `share`, opened to "anyone with the link".
 */
export async function findRecording(
  token: string,
  ev: CalEvent,
  title: string,
  afterIso: string,
  opts: { share: boolean; folder?: string[] } = { share: true },
): Promise<string | null> {
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
  if (opts.folder) await moveInto(token, fileId, await folderPath(token, opts.folder)).catch((e) => console.error("[google] move", e));
  if (opts.share) {
    await g(token, `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }).catch(() => null); // Already shared is fine.
  }
  const f = await g<{ webViewLink?: string }>(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`);
  return f.webViewLink ?? null;
}

/** Drive file id from a recording link. */
export const fileIdOf = (url: string) => url.match(/\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1] ?? null;

/**
 * Close the "anyone with the link" door. People Hamza shared the file or its
 * folder with by email (late joiners) keep access.
 */
export async function closeLinkSharing(token: string, fileId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/anyoneWithLink`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Google ${res.status}`);
}
