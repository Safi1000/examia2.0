import { serviceClient } from "@/lib/push-server";

/**
 * The saved copies of students' test answers (Supabase Storage, bucket
 * "test-drafts", one private JSON file per student and test). Shared by the
 * student's own route (/api/test-draft) and Hamza's (/api/test-draft/admin).
 * Server only: the files are read and written with the server key.
 *
 *   <student>/<test>.json        the copy while they sit it
 *   <student>/<test>.prev.json   the copy from an earlier sitting, kept aside
 *   <student>/<test>.reset.json  { at }: Hamza deleted their paper, so an
 *                                older start time or copy no longer counts
 */
export const BUCKET = "test-drafts";
export type Sb = ReturnType<typeof serviceClient>;

export const storageReady = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
export const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
/** An ISO time, or null. Sitting keys and start times are kept as written. */
export const isoOrNull = (v: unknown): string | null => (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : null);

export const fileOf = (studentId: string, testId: string, kind: "" | ".prev" | ".reset" = "") => `${studentId}/${testId}${kind}.json`;

let bucketReady = false;
export async function ensureBucket(sb: Sb) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
  bucketReady = true;
}

export async function readJson(sb: Sb, path: string): Promise<Record<string, unknown> | null> {
  const { data } = await sb.storage.from(BUCKET).download(path);
  if (!data) return null;
  try {
    const j = JSON.parse(await data.text()) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function writeJson(sb: Sb, path: string, body: unknown) {
  return sb.storage.from(BUCKET).upload(path, new Blob([JSON.stringify(body)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
}

export type CleanAnswer = { questionId: string; type: string; selectedIndex?: number; text?: string; photoUrls?: string[] };

/** Only the fields a student writes, each checked. Up to 30 pages per answer, as the test screen allows. */
export function cleanAnswers(raw: unknown): CleanAnswer[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 200).flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const x = a as Record<string, unknown>;
    if (!isId(x.questionId) || typeof x.type !== "string") return [];
    return [
      {
        questionId: x.questionId,
        type: x.type,
        ...(Number.isInteger(x.selectedIndex) ? { selectedIndex: x.selectedIndex as number } : {}),
        ...(typeof x.text === "string" ? { text: x.text.slice(0, 20_000) } : {}),
        ...(Array.isArray(x.photoUrls)
          ? { photoUrls: (x.photoUrls as unknown[]).filter((u): u is string => typeof u === "string" && /^https:\/\/res\.cloudinary\.com\//.test(u)).slice(0, 30) }
          : {}),
      },
    ];
  });
}

/** When each answer was last changed (server clock), so two devices can be joined question by question. */
export function cleanEdits(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (isId(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Which device last changed each answer (a short random name per browser). */
export function cleanBy(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (isId(k) && isId(v)) out[k] = v;
  }
  return out;
}

/** True when an answer has something in it. */
export const hasContent = (a: CleanAnswer) =>
  a.type === "mcq" ? typeof a.selectedIndex === "number" : a.type === "text" ? !!a.text?.trim() : !!a.photoUrls?.length;
