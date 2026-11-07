import { createHash } from "crypto";

/**
 * The words inside each note, page by page, for "search inside notes".
 *
 * Read from the PDF on Hamza's computer when it is uploaded, then kept on
 * Cloudinary as a private ("authenticated") file: nobody can fetch it without
 * the API secret, so a note's text is only ever seen through /api/notes/search,
 * which first checks the student may see that note. Server only.
 */

const cloud = () => process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD || "";
const creds = () => {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud() || !key || !secret) throw new Error("Cloudinary is not configured");
  return { key, secret };
};
const publicId = (noteId: string) => `note-text/${noteId}.json`;

export type NoteText = { pages: string[] };

/** Warm copies, so a search doesn't refetch every note each time. */
const cache = new Map<string, { text: NoteText | null; at: number }>();
const HIT_MS = 6 * 3600_000;
const MISS_MS = 5 * 60_000;

export async function saveNoteText(noteId: string, pages: string[]): Promise<void> {
  const { key, secret } = creds();
  const params: Record<string, string> = {
    invalidate: "true",
    overwrite: "true",
    public_id: publicId(noteId),
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: "authenticated",
  };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append("api_key", key);
  form.append("signature", createHash("sha1").update(toSign + secret).digest("hex"));
  form.append("file", new Blob([JSON.stringify({ v: 1, pages })], { type: "application/json" }), `${noteId}.json`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud()}/raw/upload`, { method: "POST", body: form });
  if (!res.ok) {
    console.error("[note-text] save", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error("Could not save the note's text");
  }
  cache.set(noteId, { text: { pages }, at: Date.now() });
}

export async function loadNoteText(noteId: string): Promise<NoteText | null> {
  const hit = cache.get(noteId);
  if (hit && Date.now() - hit.at < (hit.text ? HIT_MS : MISS_MS)) return hit.text;
  let text: NoteText | null = null;
  try {
    const { key, secret } = creds();
    const params = new URLSearchParams({ public_id: publicId(noteId), type: "authenticated" });
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud()}/raw/download?${params}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { pages?: unknown };
      if (Array.isArray(body.pages)) text = { pages: body.pages.map((p) => (typeof p === "string" ? p : "")) };
    }
  } catch (e) {
    console.error("[note-text] load", e);
  }
  cache.set(noteId, { text, at: Date.now() });
  return text;
}

export type SearchHit = { noteId: string; page: number; snippet: string; score: number };

const fold = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

/** Terms of a search: words of 2+ letters, at most 6. */
export function searchTerms(q: string): string[] {
  return [...new Set(fold(q).split(/[^a-z0-9']+/).filter((w) => w.length >= 2))].slice(0, 6);
}

/**
 * Pages where every term appears; the exact phrase scores highest. One short
 * snippet each, cut around the first match.
 */
export function searchPages(noteId: string, text: NoteText, q: string, terms: string[]): SearchHit[] {
  const phrase = fold(q.trim()).replace(/\s+/g, " ");
  const hits: SearchHit[] = [];
  text.pages.forEach((raw, i) => {
    const page = raw.replace(/\s+/g, " ");
    const low = fold(page);
    if (!terms.every((t) => low.includes(t))) return;
    const at = phrase.length > 2 && low.includes(phrase) ? low.indexOf(phrase) : low.indexOf(terms[0]);
    const count = terms.reduce((n, t) => n + low.split(t).length - 1, 0);
    const score = (low.includes(phrase) ? 10 : 0) + Math.min(count, 20);
    let from = Math.max(0, at - 70);
    let to = Math.min(page.length, at + 130);
    if (from > 0) from = page.indexOf(" ", from) + 1 || from;
    if (to < page.length) to = page.lastIndexOf(" ", to) > at ? page.lastIndexOf(" ", to) : to;
    hits.push({ noteId, page: i + 1, snippet: `${from > 0 ? "…" : ""}${page.slice(from, to).trim()}${to < page.length ? "…" : ""}`, score });
  });
  return hits;
}
