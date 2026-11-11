import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminRequest } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";
import { pkDate, addDays } from "@/lib/timetable";
import { AREAS, addSecs, mergeNote, type Area, type DayActivity, type MonthFile, type NoteActivity, type StudentActivity } from "@/lib/activity";

/**
 * POST (a signed-in student): add a batch of active time to their month file.
 * GET (admin): every student's activity from ?from=yyyy-mm-dd, or one
 * student's with &student=<id>, plus when each last signed in.
 *
 * Files live in a private Supabase Storage bucket, readable only with the
 * server key, so a student can never see their own or anyone else's.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "activity";
const DAY_CAP = 16 * 3600;
const BATCH_CAP = 4 * 3600;
/** Different notes kept in one month file, so a forged stream of ids can't grow it without end. */
const NOTES_CAP = 600;
/** The same for homework and tests with Groundwork time (each map), and how many one batch may name. */
const ITEMS_CAP = 300;
const ITEMS_PER_BATCH = 20;

type Sb = ReturnType<typeof serviceClient>;
const storageReady = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
let bucketReady = false;
async function ensureBucket(sb: Sb) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false });
  bucketReady = true;
}

async function readMonth(sb: Sb, path: string): Promise<MonthFile | null> {
  const { data } = await sb.storage.from(BUCKET).download(path);
  if (!data) return null;
  try {
    const v = JSON.parse(await data.text()) as MonthFile;
    return v && v.days && v.notes ? v : null;
  } catch {
    return null;
  }
}

const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0);
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

/**
 * Add a day's Groundwork seconds per homework (or test) to the month's map.
 * Added, never overwritten; ids checked; at most BATCH_CAP seconds in one batch
 * across all ids, days and both maps (they share `room`), and the
 * month keeps at most ITEMS_CAP different ids.
 */
function addItems(map: Record<string, number> | undefined, raw: unknown, room: { left: number }): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return map;
  let out = map;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, ITEMS_PER_BATCH)) {
    // "constructor" and the like pass isId but would read the object's own machinery, not a count.
    if (!isId(id) || id in Object.prototype || room.left <= 0) continue;
    const add = Math.round(Math.min(num(v, BATCH_CAP), room.left));
    if (!add) continue;
    out ??= {};
    if (out[id] == null && Object.keys(out).length >= ITEMS_CAP) continue;
    out[id] = Math.round((out[id] ?? 0) + add);
    room.left -= add;
  }
  return out;
}

/** One student's writes in this server, one at a time, so two batches never overwrite each other. */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

export async function POST(req: NextRequest) {
  if (!storageReady()) return NextResponse.json({ ok: true });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user } = await anon.auth.getUser();
  if (!user.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = serviceClient();
  const { data: row } = await sb.from("students").select("id").eq("user_id", user.user.id).maybeSingle();
  const studentId = row?.id as string | undefined;
  if (!studentId) return NextResponse.json({ ok: true });

  const body = (await req.json().catch(() => null)) as { days?: Record<string, unknown> } | null;
  if (!body?.days || typeof body.days !== "object") return NextResponse.json({ error: "bad request" }, { status: 400 });

  // Only the last few days count (a phone offline for a weekend still sends).
  const today = pkDate(Date.now());
  const oldest = addDays(today, -4);
  const now = Date.now();
  const byMonth = new Map<string, Array<[string, Record<string, unknown>]>>();
  for (const [day, raw] of Object.entries(body.days).slice(0, 8)) {
    if (!isDay(day) || day < oldest || day > today || !raw || typeof raw !== "object") continue;
    const m = day.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), [day, raw as Record<string, unknown>]]);
  }
  if (!byMonth.size) return NextResponse.json({ ok: true });

  await ensureBucket(sb);
  try {
    await serial(studentId, async () => {
      // One batch can credit at most BATCH_CAP of Groundwork time to homework and tests, whatever its days say.
      const itemRoom = { left: BATCH_CAP };
      for (const [month, entries] of byMonth) {
        const path = `${studentId}/${month}.json`;
        const file: MonthFile = (await readMonth(sb, path)) ?? { v: 1, days: {}, notes: {} };
        for (const [day, raw] of entries) {
          const h = addItems(file.h, raw.h, itemRoom);
          if (h) file.h = h;
          const t = addItems(file.t, raw.t, itemRoom);
          if (t) file.t = t;
          const d: DayActivity = (file.days[day] ??= { s: {} });
          const s = (raw.s ?? {}) as Record<string, unknown>;
          let room = DAY_CAP - Object.values(d.s).reduce<number>((a, n) => a + (n ?? 0), 0);
          for (const area of AREAS) {
            const add = Math.min(num(s[area], BATCH_CAP), Math.max(0, room));
            if (!add) continue;
            d.s[area as Area] = Math.round((d.s[area as Area] ?? 0) + add);
            room -= add;
          }
          const a = num(raw.a, now + 60_000);
          const b = num(raw.b, now + 60_000);
          if (a) d.a = d.a ? Math.min(d.a, a) : a;
          if (b) d.b = d.b ? Math.max(d.b, b) : b;
          const notes = (raw.n ?? {}) as Record<string, Record<string, unknown>>;
          for (const [id, n] of Object.entries(notes).slice(0, 40)) {
            if (!isId(id) || !n || typeof n !== "object") continue;
            if (!file.notes[id] && Object.keys(file.notes).length >= NOTES_CAP) continue;
            const pages = (Array.isArray(n.p) ? n.p : []).filter((p): p is number => Number.isInteger(p) && p > 0 && p <= 2000).slice(0, 400);
            const add: NoteActivity = { s: Math.round(num(n.s, BATCH_CAP)), p: pages, t: Math.round(num(n.t, 2000)), at: num(n.at, now + 60_000) || now };
            file.notes[id] = mergeNote(file.notes[id], add);
          }
        }
        const { error } = await sb.storage
          .from(BUCKET)
          .upload(path, new Blob([JSON.stringify(file)], { type: "application/json" }), { contentType: "application/json", upsert: true });
        if (error) throw new Error(error.message);
      }
    });
  } catch (err) {
    console.error("[activity] save", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** The admin page's last answer per period, for a minute, so flicking between pages doesn't re-download every file. */
const recent = new Map<string, { at: number; body: unknown }>();

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!storageReady()) return NextResponse.json({ students: {} });
  const key = `${req.nextUrl.searchParams.get("from") ?? ""}|${req.nextUrl.searchParams.get("student") ?? ""}`;
  const hit = recent.get(key);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.body, { headers: { "Cache-Control": "private, no-store" } });
  const sb = serviceClient();
  await ensureBucket(sb);

  const today = pkDate(Date.now());
  const fromParam = req.nextUrl.searchParams.get("from") ?? "";
  const from = isDay(fromParam) && fromParam <= today ? fromParam : addDays(today, -30);
  const only = req.nextUrl.searchParams.get("student");
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= today.slice(0, 7); ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    if (months.length > 14) break;
  }
  // Groundwork time per homework always covers this month and last (homework set late last month is
  // still being worked on), so last month's file is read even when `from` is in this one.
  const thisMonth = today.slice(0, 7);
  const [ty, tm] = thisMonth.split("-").map(Number);
  const lastMonth = tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, "0")}`;
  if (months[0] > lastMonth) months.unshift(lastMonth);

  let ids: string[];
  if (only) ids = isId(only) ? [only] : [];
  else {
    const { data: folders } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
    ids = (folders ?? []).map((f) => f.name).filter(isId);
  }

  const students: Record<string, StudentActivity> = {};
  const jobs = ids.flatMap((id) => months.map((m) => ({ id, m })));
  for (let i = 0; i < jobs.length; i += 24) {
    const batch = jobs.slice(i, i + 24);
    const files = await Promise.all(batch.map((j) => readMonth(sb, `${j.id}/${j.m}.json`)));
    batch.forEach((j, k) => {
      const f = files[k];
      if (!f) return;
      const st = (students[j.id] ??= { days: {}, notes: {} });
      for (const [d, v] of Object.entries(f.days)) if (d >= from) st.days[d] = v;
      for (const [nid, n] of Object.entries(f.notes)) if (n.at >= Date.parse(`${from}T00:00:00+05:00`)) st.notes[nid] = mergeNote(st.notes[nid], n);
      if (j.m >= lastMonth) {
        const h = addSecs(st.focusHomework, f.h);
        if (h) st.focusHomework = h;
        const t = addSecs(st.focusTests, f.t);
        if (t) st.focusTests = t;
      }
    });
  }

  // Last sign-in, so a student who hasn't been on since tracking began still shows when they last were.
  const { data: rows } = await sb.from("students").select("id,user_id");
  const byUser = new Map((rows ?? []).filter((r) => r.user_id && (!only || r.id === only)).map((r) => [r.user_id as string, r.id as string]));
  for (let page = 1; page <= 10 && byUser.size; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) {
      const id = byUser.get(u.id);
      if (id) (students[id] ??= { days: {}, notes: {} }).signIn = u.last_sign_in_at ?? null;
    }
    if (data.users.length < 1000) break;
  }

  const body = { students, from };
  recent.set(key, { at: Date.now(), body });
  if (recent.size > 50) recent.delete(recent.keys().next().value!);
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
