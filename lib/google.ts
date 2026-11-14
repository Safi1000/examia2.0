import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
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
  // Switch on Meet's own "record automatically" for each class.
  "https://www.googleapis.com/auth/meetings.space.settings",
];

export const googleReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const redirectUri = (origin: string) => `${origin}/api/google/callback`;

/**
 * Every call to Google gives up after this long. Without it one stuck
 * connection held the whole 15-minute run (reminders included) until the
 * server killed it. The callers already treat a failed call as "try next time".
 */
const GOOGLE_TIMEOUT_MS = 15_000;
const patience = () => AbortSignal.timeout(GOOGLE_TIMEOUT_MS);

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
  const made = Number(ts);
  // Made in the last ten minutes (and not in the future), and signed by this server.
  if (!ts || !sig || !Number.isFinite(made) || Date.now() - made > 10 * 60_000 || made - Date.now() > 60_000) return false;
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
    signal: patience(),
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
  // Only Google saying the access was revoked means "disconnected". A busy
  // Google, a rate limit or a network blip is retried, then reported as busy,
  // so Today never shows a false "Reconnect".
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let j: { access_token?: string; error?: string } = {};
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: data.refresh_token as string,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: "refresh_token",
        }),
        signal: patience(),
      });
      status = res.status;
      j = (await res.json().catch(() => ({}))) as typeof j;
    } catch {}
    if (j.access_token) return j.access_token;
    if (j.error === "invalid_grant" || j.error === "unauthorized_client") return null;
    if (attempt >= 2) throw new GoogleBusy(`Google token ${status || "network"}`);
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
}

/** Google didn't answer properly this time; the connection itself is fine. */
export class GoogleBusy extends Error {}

/** Same id for the same class on the same day, so two runs can't make two Meet rooms. */
export function classEventId(date: string, classId: string, subjectId: string): string {
  // Calendar ids allow 0-9 and a-v; hex fits.
  return "ht" + createHash("sha256").update(`${date}|${classId}|${subjectId}`).digest("hex").slice(0, 40);
}

async function g<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    signal: patience(),
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

export async function createClassEvent(token: string, title: string, startIso: string, endIso: string, id?: string) {
  if (id) {
    // Already made by another run (or saved but not recorded here): reuse it.
    const existing = await g<CalEvent & { status?: string }>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`).catch(() => null);
    if (existing && existing.status !== "cancelled") return { eventId: existing.id, meetUrl: existing.hangoutLink ?? null };
    if (existing) id = undefined; // cancelled earlier today: make a fresh one
  }
  const ev = await g<CalEvent>(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST",
    body: JSON.stringify({
      ...(id ? { id } : {}),
      summary: title,
      start: { dateTime: startIso, timeZone: "Asia/Karachi" },
      end: { dateTime: endIso, timeZone: "Asia/Karachi" },
      // A phone alert from Google Calendar 10 minutes before each class.
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
      conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  }).catch(async (e: Error) => {
    // Another run made it a moment ago (same id): use that one.
    if (id && /Google 409/.test(e.message)) return g<CalEvent>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`);
    throw e;
  });
  return { eventId: ev.id, meetUrl: ev.hangoutLink ?? null };
}

// ---- Meet: each class records by itself -----------------------------------------

interface MeetSpace {
  name: string;
  config?: { artifactConfig?: { recordingConfig?: { autoRecordingGeneration?: string } } };
}

/**
 * Turns on Meet's "record automatically" for a class link, so recording starts
 * when Hamza joins (no Record button to remember). Hamza must be the meeting's
 * organiser, which he is for every link made here. Safe to call again: a room
 * already set is left alone.
 */
export async function autoRecord(token: string, meetUrl: string): Promise<"on" | "already"> {
  const code = meetUrl.match(/meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/i)?.[1];
  if (!code) throw new Error("not a Meet link");
  const space = await g<MeetSpace>(token, `https://meet.googleapis.com/v2/spaces/${code}`);
  if (space.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration === "ON") return "already";
  await g<MeetSpace>(token, `https://meet.googleapis.com/v2/${space.name}?updateMask=config.artifactConfig.recordingConfig.autoRecordingGeneration`, {
    method: "PATCH",
    body: JSON.stringify({ config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" } } } }),
  });
  return "on";
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
    signal: patience(),
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

/** Put a file in Drive's bin (it can be restored from there for 30 days). */
export async function trashFile(token: string, fileId: string) {
  await g(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
}

/** The address of the main recordings folder in Drive (made if it isn't there yet). */
export async function recordingsFolderUrl(token: string): Promise<string> {
  return `https://drive.google.com/drive/folders/${await folderPath(token, [RECORDINGS_ROOT])}`;
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
    const q = `mimeType contains 'video/' and trashed = false and createdTime > '${afterIso}' and name contains '${title.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
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
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/anyoneWithLink`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: patience(),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Google ${res.status}`);
}

/**
 * Open the "anyone with the link can view" door again (Recordings page: a
 * catch-up window or "Open for 48 hours"). Safe to repeat: Drive keeps one
 * "anyone" permission per file. Throws when Google refuses, so the caller can
 * count it as failed instead of showing students a link that will not open.
 */
export async function openLinkSharing(token: string, fileId: string) {
  await g(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=id`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

/** Copying a long class video can take Google longer than an ordinary call. */
const COPY_TIMEOUT_MS = 45_000;

/**
 * Give a recording a NEW link (Recordings page, "Refresh links"). Drive cannot
 * change a file's link, so the file is copied (a copy has a new id, so a new
 * link) into the same folder with the same name. The copy starts private, like
 * every new Drive file. The original is never deleted: its link sharing is
 * closed and it is moved into "Hamza Teaches recordings / Replaced links", where
 * Hamza can delete it later to free Drive space. Returns the copy's link.
 */
export async function copyRecording(token: string, fileId: string): Promise<{ url: string; newId: string }> {
  const src = await g<{ name?: string; parents?: string[] }>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,parents`);
  const copy = await g<{ id: string; webViewLink?: string }>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ ...(src.name ? { name: src.name } : {}), ...(src.parents?.length ? { parents: src.parents } : {}) }),
    signal: AbortSignal.timeout(COPY_TIMEOUT_MS),
  });
  const url = copy.webViewLink ?? `https://drive.google.com/file/d/${copy.id}/view?usp=drivesdk`;
  return { url, newId: copy.id };
}

/** Where originals go once a recording has a new link. Never deleted by the site. */
export const REPLACED_FOLDER = [RECORDINGS_ROOT, "Replaced links"];

/** Move a file into "Replaced links" (best effort: a failure leaves it where it was). */
export async function moveToReplaced(token: string, fileId: string) {
  await moveInto(token, fileId, await folderPath(token, REPLACED_FOLDER));
}
