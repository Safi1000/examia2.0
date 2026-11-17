import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The upload key for notes made outside the console (Claude on Hamza's Mac).
 * It can do one thing: add a note to a level and subject. Only a fingerprint
 * of it is kept (a private file in the teacher bucket), so the key itself is
 * shown once, when it is made, and can't be read back by anyone.
 */
const BUCKET = "teacher";
const FILE = "notes-key.json";

export type KeyFile = { hash: string; createdAt: string; lastUsedAt?: string; lastNote?: string };

const digest = (s: string) => createHash("sha256").update(s).digest();

async function ensureBucket(sb: SupabaseClient) {
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
}

export async function readKey(sb: SupabaseClient): Promise<KeyFile | null> {
  const { data } = await sb.storage.from(BUCKET).download(FILE);
  if (!data) return null;
  try {
    const v = JSON.parse(await data.text()) as KeyFile;
    return typeof v?.hash === "string" && v.hash.length === 64 ? v : null;
  } catch {
    return null;
  }
}

async function write(sb: SupabaseClient, v: KeyFile) {
  await ensureBucket(sb);
  const { error } = await sb.storage.from(BUCKET).upload(FILE, JSON.stringify(v), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(error.message);
}

/** Make a new key (the old one stops working). Returns it once. */
export async function makeKey(sb: SupabaseClient): Promise<string> {
  const key = `htn_${randomBytes(32).toString("hex")}`;
  await write(sb, { hash: digest(key).toString("hex"), createdAt: new Date().toISOString() });
  return key;
}

export async function clearKey(sb: SupabaseClient) {
  await sb.storage.from(BUCKET).remove([FILE]);
}

/** True when `given` is the live key. Takes the same time whatever was sent. */
export async function checkKey(sb: SupabaseClient, given: string | null): Promise<boolean> {
  if (!given || given.length > 200) return false;
  const saved = await readKey(sb);
  if (!saved) return false;
  return timingSafeEqual(digest(given), Buffer.from(saved.hash, "hex"));
}

/** Remember when the key last added a note, for the Settings card. */
export async function touchKey(sb: SupabaseClient, note: string) {
  const saved = await readKey(sb);
  if (saved) await write(sb, { ...saved, lastUsedAt: new Date().toISOString(), lastNote: note.slice(0, 120) }).catch(() => {});
}
