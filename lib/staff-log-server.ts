import type { serviceClient } from "@/lib/push-server";

/**
 * The staff log: what each staff member did in the console, for Hamza only
 * (Settings). A private JSON file in Supabase Storage, so no database change.
 * Written by app/api/admin/staff (lines the console sends) and by server
 * routes that staff may call (a timetable change).
 */
type Sb = ReturnType<typeof serviceClient>;
export type StaffLine = { at: string; name: string; what: string };
const BUCKET = "teacher";
const LOG = "staff-log.json";
const LOG_MAX = 2000;

export async function readStaffLog(sb: Sb): Promise<StaffLine[]> {
  const { data } = await sb.storage.from(BUCKET).download(LOG);
  if (!data) return [];
  try {
    const v = JSON.parse(await data.text()) as StaffLine[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** One writer at a time in this server, so two lines never overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();

/** Add one line. Never throws: the log is a help for Hamza, not part of the action. */
export async function addStaffLine(sb: Sb, name: string, what: string): Promise<void> {
  const text = what.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) return;
  const job = async () => {
    const { data: bucket } = await sb.storage.getBucket(BUCKET);
    if (!bucket) await sb.storage.createBucket(BUCKET, { public: false });
    const log = await readStaffLog(sb);
    log.push({ at: new Date().toISOString(), name, what: text });
    await sb.storage.from(BUCKET).upload(LOG, new Blob([JSON.stringify(log.slice(-LOG_MAX))], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  };
  queue = queue.then(job, job);
  await queue.catch(() => {});
}
