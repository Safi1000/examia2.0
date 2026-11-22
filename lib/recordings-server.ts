import type { SupabaseClient } from "@supabase/supabase-js";
import { LEVEL_LABEL, RECORDING_HOURS, addDays, at, levelOf, pkDate, setSchedule, slotsOn, subjectOf } from "@/lib/timetable";
import { loadSchedule } from "@/lib/schedule-server";
import { RECORDINGS_ROOT, closeLinkSharing, copyIntoAccount, copyRecording, driveFreeBytes, fileIdOf, fileInto, moveToReplaced, openLinkSharing, ownedFolderIds, ownedVideos, trashFile } from "@/lib/google";
import { CATCH_UP_HOURS, cleanAccess, emptyAccess, openUntil, splitKey, viewOf, type AccessFile } from "@/lib/recording-access";

/**
 * Server side of the Recordings page (see lib/recording-access.ts for the
 * rules). Every Google step runs in small batches inside a time budget, so a
 * long list can never fail half way without saying so: what is left stays in
 * the file and the next press (or the 15-minute job) carries on.
 */

const BUCKET = "teacher";
const FILE = "recordings.json";
/** Recordings handled per press of a button; the page presses again until done. */
const BATCH = 12;
/** Stop starting new Google calls after this long, so the request always answers. */
const BUDGET_MS = 35_000;
/** Copies are slower (whole videos): fewer per press. */
const REFRESH_BATCH = 3;
/** Overrides kept, so the file can never grow without end. */
const OVERRIDES_CAP = 3_000;

type Sb = SupabaseClient;

let bucketReady = false;
async function ensureBucket(sb: Sb) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
  bucketReady = true;
}

export async function readAccess(sb: Sb): Promise<AccessFile> {
  await ensureBucket(sb);
  const { data } = await sb.storage.from(BUCKET).download(FILE);
  if (!data) return emptyAccess();
  try {
    return cleanAccess(JSON.parse(await data.text()));
  } catch {
    return emptyAccess();
  }
}

/** Saves in this server one at a time, so two quick presses never overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();
/**
 * Read the latest file, change it, write it back. Google work happens outside
 * this (it is slow); only the small result is merged in here, on a fresh read,
 * so the 15-minute job and a press on the page don't undo each other.
 */
export function mutateAccess(sb: Sb, change: (a: AccessFile) => void): Promise<AccessFile> {
  const job = async () => {
    const a = await readAccess(sb);
    change(a);
    // Keep the newest overrides only.
    const keys = Object.keys(a.overrides);
    if (keys.length > OVERRIDES_CAP) for (const k of keys.sort().slice(0, keys.length - OVERRIDES_CAP)) delete a.overrides[k];
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(FILE, new Blob([JSON.stringify(a)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    if (error) throw new Error(error.message);
    return a;
  };
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
}

export interface RecRow {
  key: string;
  date: string;
  classId: string;
  subjectId: string;
  url: string;
}

/** Every class recording so far, read 1,000 rows at a time (Supabase's page size). */
export async function recordingRows(sb: Sb): Promise<RecRow[]> {
  const out: RecRow[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await sb
      .from("class_links")
      .select("on_date,class_id,subject_id,recording_url")
      .not("recording_url", "is", null)
      .order("on_date", { ascending: false })
      .order("class_id")
      .order("subject_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const date = r.on_date as string;
      const classId = r.class_id as string;
      const subjectId = r.subject_id as string;
      out.push({ key: `${date}|${classId}|${subjectId}`, date, classId, subjectId, url: r.recording_url as string });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/**
 * Each recording's own 48 hours, worked out the same way as the automation:
 * from the class's end on the timetable. Only the last few days can still be
 * inside it, so older dates are skipped. A class no longer on the timetable
 * counts from the end of its day (a few hours longer at most, never shorter).
 */
export async function normalCloser(sb: Sb, now: number) {
  setSchedule(await loadSchedule(sb));
  const [{ data: classes }, { data: subjects }] = await Promise.all([sb.from("classes").select("id,name,created_at"), sb.from("subjects").select("id,name,created_at")]);
  const db = {
    classes: (classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, createdAt: c.created_at as string })),
    subjects: (subjects ?? []).map((s) => ({ id: s.id as string, name: s.name as string, createdAt: s.created_at as string })),
  };
  const oldest = addDays(pkDate(now), -3);
  return (key: string) => {
    const { date, classId, subjectId } = splitKey(key);
    if (date < oldest) return 0;
    const slot = slotsOn(db, date).find((s) => s.classId === classId && s.subjectId === subjectId);
    return (slot?.endMs ?? at(date, "23:59")) + RECORDING_HOURS * 3_600_000;
  };
}

const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

// ---- Catch-up window ---------------------------------------------------------

/**
 * Start "Open all recordings to students for 48 hours". Safe to press twice: a
 * window that is already running is kept as it is (same end time).
 */
export async function startCatchUp(sb: Sb, now: number) {
  const rows = await recordingRows(sb);
  return mutateAccess(sb, (a) => {
    if (a.catchUp && a.catchUp.endsAt > now) return;
    if (a.catchUp) a.lastCatchUp = summary(a.catchUp);
    const todo = rows.flatMap((r) => {
      const f = fileIdOf(r.url);
      return f ? [{ k: r.key, f }] : [];
    });
    const failed: Record<string, { f: string; why: string }> = {};
    // A pasted link that isn't a Drive file can't be opened from here.
    for (const r of rows) if (!fileIdOf(r.url)) failed[r.key] = { f: "", why: "Not a Google Drive file link" };
    a.catchUp = { startedAt: now, endsAt: now + CATCH_UP_HOURS * 3_600_000, upTo: pkDate(now), total: rows.length, todo, failed };
    // "Open all" means all: recordings closed by hand earlier are included again.
    for (const [k, v] of Object.entries(a.overrides)) if (v === 0) delete a.overrides[k];
  });
}

function summary(c: NonNullable<AccessFile["catchUp"]>) {
  const failed = Object.keys(c.failed).length;
  return { startedAt: c.startedAt, endsAt: c.endsAt, opened: Math.max(0, c.total - c.todo.length - failed), failed };
}

/** Open the next batch of the running catch-up in Drive. */
export async function continueCatchUp(sb: Sb, token: string, now: number, budgetMs = BUDGET_MS, batch = BATCH) {
  const start = Date.now();
  const a = await readAccess(sb);
  const c = a.catchUp;
  if (!c || c.endsAt <= now || !c.todo.length) return a;
  const done: string[] = [];
  const failed: Record<string, { f: string; why: string }> = {};
  for (const t of c.todo.slice(0, batch)) {
    if (Date.now() - start > budgetMs) break;
    try {
      await openLinkSharing(token, t.f);
      done.push(t.k);
    } catch (e) {
      failed[t.k] = { f: t.f, why: short(e) };
    }
  }
  const fileOf = new Map(c.todo.map((t) => [t.k, t.f]));
  return mutateAccess(sb, (x) => {
    if (!x.catchUp || x.catchUp.startedAt !== c.startedAt) return;
    const handled = new Set([...done, ...Object.keys(failed)]);
    x.catchUp.todo = x.catchUp.todo.filter((t) => !handled.has(t.k));
    Object.assign(x.catchUp.failed, failed);
    for (const k of done) x.shared[k] = { f: fileOf.get(k)! };
  });
}

/** "Try the rest again": the ones Google refused go back on the list. */
export function retryFailed(sb: Sb, now: number) {
  return mutateAccess(sb, (a) => {
    const c = a.catchUp;
    if (!c || c.endsAt <= now) return;
    for (const [k, v] of Object.entries(c.failed)) {
      if (!v.f) continue; // not a Drive link: trying again can't help
      c.todo.push({ k, f: v.f });
      delete c.failed[k];
    }
  });
}

/** "Close now" on the catch-up: it ends this minute, then the sharing is closed in batches. */
export function endCatchUp(sb: Sb, now: number) {
  return mutateAccess(sb, (a) => {
    if (a.catchUp && a.catchUp.endsAt > now) a.catchUp.endsAt = now;
  });
}

// ---- One recording ----------------------------------------------------------

export async function openOne(sb: Sb, token: string, key: string, now: number) {
  const row = (await recordingRows(sb)).find((r) => r.key === key);
  const f = row ? fileIdOf(row.url) : null;
  if (!f) throw new Error("This recording isn't a Google Drive file, so it can't be opened from here.");
  await openLinkSharing(token, f);
  return mutateAccess(sb, (a) => {
    a.overrides[key] = now + CATCH_UP_HOURS * 3_600_000;
    a.shared[key] = { f };
  });
}

/** Closed by hand: beats every window until it is opened again. */
export async function closeOne(sb: Sb, token: string, key: string) {
  const row = (await recordingRows(sb)).find((r) => r.key === key);
  const f = row ? fileIdOf(row.url) : null;
  let closed = false;
  if (f) {
    try {
      await closeLinkSharing(token, f);
      closed = true;
    } catch {}
  }
  const a = await mutateAccess(sb, (x) => {
    x.overrides[key] = 0;
    // Not closed yet: the 15-minute job keeps trying.
    if (closed || !f) delete x.shared[key];
    else x.shared[key] = { f, tries: (x.shared[key]?.tries ?? 0) + 1 };
  });
  return { access: a, closed: closed || !f };
}

/**
 * Delete one recording: the file goes to Drive's bin (Hamza can restore it there
 * for 30 days), and the portal forgets the link, so students no longer see it.
 * The automation never picks a binned file up again.
 *
 * Classes taught together share one video file. Then only this class's link
 * is removed and the file stays (`kept`), so the other class's students still
 * have it. The file goes to the bin only once no other class uses it.
 */
export async function deleteOne(sb: Sb, token: string | null, key: string) {
  const rows = await recordingRows(sb);
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error("This recording is already gone.");
  const f = fileIdOf(row.url);
  const kept = !!f && rows.some((r) => r.key !== key && fileIdOf(r.url) === f);
  let binned = false;
  if (f && token && !kept) {
    try {
      await trashFile(token, f);
      binned = true;
    } catch {}
  }
  const { error } = await sb.from("class_links").update({ recording_url: null }).eq("on_date", row.date).eq("class_id", row.classId).eq("subject_id", row.subjectId);
  if (error) throw new Error("This recording couldn't be removed. Try again.");
  const a = await mutateAccess(sb, (x) => {
    delete x.overrides[key];
    delete x.shared[key];
  });
  return { access: a, binned, kept };
}

// ---- Closing when windows end ---------------------------------------------------

/**
 * Close the sharing on every recording the site opened for a window that has
 * now ended, unless it is still inside its own normal 48 hours (then the normal
 * automation closes it on time). Called by the 15-minute job and after "Close
 * now". Also finishes a catch-up whose time is up and opens any of a running
 * catch-up that are still waiting (if the page was closed mid way).
 */
export async function sweepAccess(sb: Sb, token: string, now: number, budgetMs = 15_000) {
  const start = Date.now();
  let a = await readAccess(sb);
  // Nothing open from this page and nothing to tidy: the usual case, no extra work.
  if (!a.catchUp && !Object.keys(a.shared).length && !Object.values(a.overrides).some((v) => v > 0)) return { access: a, closed: 0, stuck: 0, left: 0 };
  // A running catch-up the page didn't finish opening: carry on here.
  if (a.catchUp && a.catchUp.endsAt > now && a.catchUp.todo.length) a = await continueCatchUp(sb, token, now, budgetMs / 2, 8);

  const normal = await normalCloser(sb, now);
  const view = viewOf(a, now);
  const closed: string[] = [];
  const stuck: string[] = [];
  for (const [k, s] of Object.entries(a.shared)) {
    if (Date.now() - start > budgetMs) break;
    if (openUntil(k, splitKey(k).date, normal(k), view, now) > now) continue;
    // Still in its own 48 hours: those are the normal automation's to close.
    if (a.overrides[k] !== 0 && normal(k) > now) {
      closed.push(k); // just stop tracking it here
      continue;
    }
    try {
      await closeLinkSharing(token, s.f);
      closed.push(k);
    } catch {
      stuck.push(k);
    }
  }
  const after = await mutateAccess(sb, (x) => {
    for (const k of closed) delete x.shared[k];
    for (const k of stuck) if (x.shared[k]) x.shared[k].tries = (x.shared[k].tries ?? 0) + 1;
    // Finished windows: keep a one-line history, drop expired overrides.
    if (x.catchUp && x.catchUp.endsAt <= now) {
      x.lastCatchUp = summary(x.catchUp);
      x.catchUp = null;
    }
    for (const [k, v] of Object.entries(x.overrides)) if (v > 0 && v <= now) delete x.overrides[k];
  });
  return { access: after, closed: closed.length, stuck: stuck.length, left: Object.keys(after.shared).filter((k) => openUntil(k, splitKey(k).date, normal(k), viewOf(after, now), now) <= now).length };
}

/**
 * True while the Recordings page keeps this recording open beyond its normal
 * 48 hours, so the automation's normal "close at 48 hours" must wait (the
 * sweep above closes it when the window ends).
 */
export function heldOpen(a: AccessFile | null, key: string, date: string, now: number) {
  if (!a) return false;
  return openUntil(key, date, 0, viewOf(a, now), now) > now;
}

// ---- New links ------------------------------------------------------------------

/**
 * "Refresh links": each recording gets a copy with a new link, saved as its
 * recording link (the same class_links row the teacher's Classes page saves).
 * The old file's sharing is closed and it moves to "Replaced links". Recordings
 * open to students right now are skipped (their students are using the link).
 */
export async function refreshLinks(sb: Sb, token: string, keys: string[], now: number) {
  const start = Date.now();
  const rows = new Map((await recordingRows(sb)).map((r) => [r.key, r]));
  const a = await readAccess(sb);
  const normal = await normalCloser(sb, now);
  const view = viewOf(a, now);
  const done: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ key: string; why: string }> = [];
  const left: string[] = [];
  for (const key of keys) {
    const row = rows.get(key);
    const f = row ? fileIdOf(row.url) : null;
    if (!row || !f) {
      failed.push({ key, why: "Not a Google Drive file link" });
      continue;
    }
    if (openUntil(key, row.date, normal(key), view, now) > now) {
      skipped.push(key);
      continue;
    }
    if (done.length + failed.length >= REFRESH_BATCH || Date.now() - start > BUDGET_MS) {
      left.push(key);
      continue;
    }
    try {
      const copy = await copyRecording(token, f);
      const { error } = await sb
        .from("class_links")
        .upsert(
          { on_date: row.date, class_id: row.classId, subject_id: row.subjectId, recording_url: copy.url, updated_at: new Date().toISOString() },
          { onConflict: "on_date,class_id,subject_id" },
        );
      if (error) {
        // The copy is not in use: move it out of the way, keep the old link.
        await moveToReplaced(token, copy.newId).catch(() => {});
        throw new Error(error.message);
      }
      // The old link stops working for good; the old file is kept, moved aside.
      await closeLinkSharing(token, f).catch(() => {});
      await moveToReplaced(token, f).catch((e) => console.error("[recordings] move old", short(e)));
      done.push(key);
    } catch (e) {
      failed.push({ key, why: short(e) });
    }
  }
  const access = await mutateAccess(sb, (x) => {
    if (done.length && !left.length) x.refreshedAt = now;
    for (const k of done) delete x.shared[k];
  });
  return { access, refreshed: done.length, skipped: skipped.length, failed, left };
}

// ---- Moving to another Google account ------------------------------------------

/** Start no new copy after this long (one copy can take 40 seconds; the server allows 60). */
const MOVE_START_MS = 10_000;
/** Copies per press; the page presses again until none are left. */
const MOVE_BATCH = 3;

export interface MoveInfo {
  /** The connected Google account. */
  email: string | null;
  /** Videos that still live in another Google account (classes taught together share one). */
  toMove: number;
  /** Free Drive space in the connected account, in bytes (null: Google didn't say). */
  freeBytes: number | null;
}

/**
 * Recordings that are not properly in the connected account yet, one entry per video:
 *   foreign    the video belongs to another Google account (needs a copy);
 *   misplaced  the video is this account's, but sits in a folder this account
 *              doesn't own (or in no folder), so it would be lost from view
 *              when the other account's folder goes.
 */
async function unsettledVideos(sb: Sb, token: string) {
  const [rows, owned, folders] = await Promise.all([recordingRows(sb), ownedVideos(token), ownedFolderIds(token)]);
  const foreign = new Map<string, RecRow[]>();
  const misplaced = new Map<string, RecRow[]>();
  for (const r of rows) {
    const f = fileIdOf(r.url);
    if (!f) continue;
    const parents = owned.get(f);
    const into = !parents ? foreign : parents.some((p) => folders.has(p)) ? null : misplaced;
    if (into) into.set(f, [...(into.get(f) ?? []), r]);
  }
  return { foreign, misplaced };
}

/** After Hamza connects a different Google account: how many recordings are not settled in it yet. */
export async function moveStatus(sb: Sb, token: string): Promise<MoveInfo> {
  const [videos, freeBytes, { data }] = await Promise.all([
    unsettledVideos(sb, token),
    driveFreeBytes(token).catch(() => null),
    sb.from("google_account").select("email").eq("id", 1).maybeSingle(),
  ]);
  return { email: (data?.email as string | null) ?? null, toMove: videos.foreign.size + videos.misplaced.size, freeBytes };
}

/** Filing a video is quick (no copy): many per press, inside this much time. */
const FILE_BATCH = 25;
const FILE_BUDGET_MS = 25_000;

/**
 * "Move recordings to this account": the next few videos are copied into the
 * connected account (its own level and subject folders), and every class that
 * used the old video now points at the copy. A recording open to students
 * right now stays open on the copy. The old account's files are never touched.
 * Videos this account already owns but that sit in another account's folder
 * are filed into its own folders first (no copy, the link stays the same).
 * `skip` holds recordings that already failed in this run, so the rest carry on.
 */
export async function moveBatch(sb: Sb, token: string, now: number, skip: string[]) {
  const start = Date.now();
  const skipped = new Set(skip);
  const fresh = ([, rows]: [string, RecRow[]]) => !rows.some((r) => skipped.has(r.key));
  const all = await unsettledVideos(sb, token);
  const misplaced = [...all.misplaced.entries()].filter(fresh);
  const videos = [...all.foreign.entries()].filter(fresh);
  const [{ data: classes }, { data: subjects }] = await Promise.all([sb.from("classes").select("id,name"), sb.from("subjects").select("id,name")]);
  const folderOf = (r: RecRow) => {
    const c = classes?.find((x) => x.id === r.classId);
    const s = subjects?.find((x) => x.id === r.subjectId);
    const lvl = c ? levelOf({ name: c.name as string }) : null;
    const sub = s ? subjectOf({ name: s.name as string }) : null;
    return lvl && sub ? [RECORDINGS_ROOT, LEVEL_LABEL[lvl].replace(" / ", " and "), sub] : [RECORDINGS_ROOT, "Other"];
  };
  const failed: Array<{ key: string; why: string }> = [];
  let moved = 0;
  let filed = 0;
  for (const [f, rows] of misplaced) {
    if (filed + failed.length >= FILE_BATCH || Date.now() - start > FILE_BUDGET_MS) break;
    try {
      await fileInto(token, f, folderOf(rows[0]));
      filed++;
    } catch (e) {
      failed.push({ key: rows[0].key, why: short(e) });
    }
  }
  const normal = await normalCloser(sb, now);
  const view = viewOf(await readAccess(sb), now);
  const swapped = new Map<string, string>();
  for (const [f, rows] of videos) {
    if (moved + failed.length >= MOVE_BATCH || Date.now() - start > MOVE_START_MS) break;
    const first = rows[0];
    try {
      const copy = await copyIntoAccount(token, f, folderOf(first));
      // Students are watching it right now: the copy must open for them too.
      if (rows.some((r) => openUntil(r.key, r.date, normal(r.key), view, now) > now)) await openLinkSharing(token, copy.newId);
      for (const r of rows) {
        const { error } = await sb
          .from("class_links")
          .update({ recording_url: copy.url, updated_at: new Date().toISOString() })
          .eq("on_date", r.date)
          .eq("class_id", r.classId)
          .eq("subject_id", r.subjectId);
        if (error) throw new Error(error.message);
      }
      swapped.set(f, copy.newId);
      moved++;
    } catch (e) {
      const why = short(e);
      failed.push({
        key: first.key,
        why: /Google 404/.test(why)
          ? "This account can't see the video. Share the recordings folder with it from the old account."
          : /storageQuota|quota/i.test(why)
            ? "Google Drive is full, or today's copy limit is used up."
            : why,
      });
    }
  }
  // Anything the site was keeping track of by the old video's id now follows the copy.
  const access = await mutateAccess(sb, (x) => {
    if (!swapped.size) return;
    for (const v of Object.values(x.shared)) v.f = swapped.get(v.f) ?? v.f;
    if (x.catchUp) {
      for (const t of x.catchUp.todo) t.f = swapped.get(t.f) ?? t.f;
      for (const v of Object.values(x.catchUp.failed)) v.f = swapped.get(v.f) ?? v.f;
    }
  });
  return { access, moved: moved + filed, failed, left: Math.max(0, videos.length + misplaced.length - moved - filed - failed.length) };
}
