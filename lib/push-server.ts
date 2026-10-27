import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clock, liveSlotsOn, pkDate, setSchedule } from "@/lib/timetable";
import { loadSchedule } from "@/lib/schedule-server";
import { assignmentCopy, classCopy, recordingCopy, resultCopy, studyCopy, testOpensCopy } from "@/lib/notify-copy";

/**
 * Phone notifications, server side. The rules that keep them quiet:
 *
 *  1. Only four kinds: results out, test opens in 30 min, assignment due
 *     within 24 h (not handed in), and their first class of the day starting
 *     (one a day, sent in the 15 minutes before it starts).
 *  2. Never the same thing twice (notify_log is the memory).
 *  3. At most 3 a day per student (Pakistan day).
 *  4. Nothing between 10 pm and 8 am Pakistan time. Results released at night
 *     go out in the morning; reminders whose moment passed overnight are dropped.
 *  5. Each kind can be switched off by the student (notify_prefs; the class
 *     reminder's switch lives on their profile, so no database change).
 *  6. Several results at once arrive as one notification.
 *  7. Past students (switched-off cohorts) never get anything.
 */

const DAILY_CAP = 3;
const TZ = "Asia/Karachi";

export function pushReady(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const pkHour = (d = new Date()) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(d));
export const isQuietHours = (d = new Date()) => {
  const h = pkHour(d);
  return h >= 22 || h < 8;
};
const pkTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const pkDayStart = (d = new Date()) => {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // yyyy-mm-dd
  return new Date(`${ymd}T00:00:00+05:00`).toISOString();
};

type Kind = "results" | "tests" | "assignments" | "classes" | "study" | "recordings";
interface Item {
  studentId: string;
  kind: Kind;
  /** Dedupe keys this notification covers (one per result when grouped). */
  refs: string[];
  title: string;
  body: string;
  url: string;
  tag: string;
  priority: number;
}

interface Sub {
  id: string;
  student_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Apply rules 2, 3 and 5, then send. Returns how many went out. */
async function deliver(sb: SupabaseClient, items: Item[]): Promise<number> {
  if (!items.length) return 0;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hamzasadakat7@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const ids = [...new Set(items.map((i) => i.studentId))];
  const today = pkDayStart();
  // Only today's log is read (for the daily cap): the whole log would pass the
  // 1,000-row read limit within weeks, and repeats are stopped by the insert below.
  const [{ data: subs }, { data: prefs }, { data: log }] = await Promise.all([
    sb.from("push_subscriptions").select("*").in("student_id", ids),
    sb.from("notify_prefs").select("*").in("student_id", ids),
    sb.from("notify_log").select("student_id,kind,ref,sent_at").in("student_id", ids).gte("sent_at", today),
  ]);
  const subsBy = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) subsBy.set(s.student_id, [...(subsBy.get(s.student_id) ?? []), s]);
  const prefBy = new Map((prefs ?? []).map((p) => [p.student_id as string, p as Record<Kind, boolean>]));
  const sent = new Set((log ?? []).map((l) => `${l.student_id}|${l.kind}|${l.ref}`));
  const todayCount = new Map<string, number>();
  for (const l of log ?? []) todayCount.set(l.student_id as string, (todayCount.get(l.student_id as string) ?? 0) + 1);

  let count = 0;
  for (const it of items.sort((a, b) => a.priority - b.priority)) {
    const devices = subsBy.get(it.studentId);
    if (!devices?.length) continue;
    if (prefBy.get(it.studentId)?.[it.kind] === false) continue;
    const fresh = it.refs.filter((r) => !sent.has(`${it.studentId}|${it.kind}|${r}`));
    if (!fresh.length) continue;
    if ((todayCount.get(it.studentId) ?? 0) >= DAILY_CAP) continue;

    // Remember first, so a retry can never double-send. Only rows this insert
    // actually added come back: if every one was already logged, it was sent before.
    const { data: added, error } = await sb
      .from("notify_log")
      .upsert(fresh.map((ref) => ({ student_id: it.studentId, kind: it.kind, ref })), { onConflict: "student_id,kind,ref", ignoreDuplicates: true })
      .select("ref");
    fresh.forEach((r) => sent.add(`${it.studentId}|${it.kind}|${r}`));
    if (error || !added?.length) continue;
    todayCount.set(it.studentId, (todayCount.get(it.studentId) ?? 0) + 1);

    const payload = JSON.stringify({ title: it.title, body: it.body, url: it.url, tag: it.tag });
    for (const d of devices) {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 60 * 60 * 6 });
      } catch (e) {
        // The phone unsubscribed or the browser data was cleared: forget the device.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", d.id);
      }
    }
    count++;
  }
  return count;
}

/**
 * Hamza cancelled, moved or added a class: tell just the students in it.
 * Quiet hours and the daily cap still apply (the portal shows the change too).
 */
export async function notifyClassChange(sb: SupabaseClient, studentIds: string[], ref: string, title: string, body: string): Promise<number> {
  if (!pushReady() || isQuietHours() || !studentIds.length) return 0;
  return deliver(
    sb,
    studentIds.map((studentId) => ({ studentId, kind: "classes" as const, refs: [ref], title, body, url: "/classes", tag: `change-${ref}`, priority: -2 })),
  );
}

/** Students we may notify: have a device, and their cohort is switched on. */
async function reachableStudents(sb: SupabaseClient) {
  const [{ data: subs }, { data: students }, { data: cohorts }, { data: sc }, { data: ss }] = await Promise.all([
    sb.from("push_subscriptions").select("student_id"),
    sb.from("students").select("id,cohort_id"),
    sb.from("cohorts").select("id,active"),
    sb.from("student_classes").select("student_id,class_id"),
    sb.from("student_subjects").select("student_id,subject_id"),
  ]);
  const withDevice = new Set((subs ?? []).map((s) => s.student_id as string));
  const off = new Set((cohorts ?? []).filter((c) => c.active === false).map((c) => c.id as string));
  const classes = new Map<string, Set<string>>();
  for (const r of sc ?? []) classes.set(r.student_id, (classes.get(r.student_id) ?? new Set()).add(r.class_id));
  const subjects = new Map<string, Set<string>>();
  for (const r of ss ?? []) subjects.set(r.student_id, (subjects.get(r.student_id) ?? new Set()).add(r.subject_id));
  return (students ?? [])
    .filter((s) => withDevice.has(s.id) && !(s.cohort_id && off.has(s.cohort_id)))
    .map((s) => ({ id: s.id as string, cohortId: (s.cohort_id as string) ?? null, classes: classes.get(s.id) ?? new Set<string>(), subjects: subjects.get(s.id) ?? new Set<string>() }));
}

type Reach = Awaited<ReturnType<typeof reachableStudents>>[number];
const covers = (w: { cohort_id: string | null; class_id: string | null; subject_id: string | null }, s: Reach, cohortRequired = false) =>
  (cohortRequired ? w.cohort_id === s.cohortId : w.cohort_id === null || w.cohort_id === s.cohortId) &&
  (!w.class_id || s.classes.has(w.class_id)) &&
  (!w.subject_id || s.subjects.has(w.subject_id));

/** Results released in the last 24 h (or just these submissions), grouped per student. */
async function resultItems(sb: SupabaseClient, onlyIds?: string[]): Promise<Item[]> {
  let q = sb.from("submissions").select("id,student_id,test_id,released_at").eq("status", "released");
  q = onlyIds?.length ? q.in("id", onlyIds) : q.gte("released_at", new Date(Date.now() - 864e5).toISOString());
  const { data: found } = await q;
  if (!found?.length) return [];
  // Past students (switched-off cohorts) never get anything (rule 7).
  const [{ data: studs }, { data: cohorts }] = await Promise.all([
    sb.from("students").select("id,cohort_id").in("id", [...new Set(found.map((s) => s.student_id as string))]),
    sb.from("cohorts").select("id,active").eq("active", false),
  ]);
  const off = new Set((cohorts ?? []).map((c) => c.id as string));
  const current = new Set((studs ?? []).filter((s) => !(s.cohort_id && off.has(s.cohort_id))).map((s) => s.id as string));
  const subs = found.filter((s) => current.has(s.student_id as string));
  if (!subs.length) return [];
  const { data: tests } = await sb.from("tests").select("id,title").in("id", [...new Set(subs.map((s) => s.test_id))]);
  const title = new Map((tests ?? []).map((t) => [t.id as string, t.title as string]));
  const by = new Map<string, typeof subs>();
  for (const s of subs) by.set(s.student_id, [...(by.get(s.student_id) ?? []), s]);
  return [...by.entries()].map(([studentId, list]) => ({
    studentId,
    kind: "results" as const,
    refs: list.map((s) => s.id as string),
    ...resultCopy(list.map((r) => r.id ?? r.test_id).join(","), list.length, title.get(list[0].test_id)),
    url: list.length === 1 ? `/results/${list[0].test_id}` : "/progress",
    tag: "results",
    priority: 0,
  }));
}

/** Everything due right now. Called every 15 minutes. */
export async function runReminders(): Promise<{ sent: number; quiet?: boolean }> {
  if (!pushReady()) return { sent: 0 };
  if (isQuietHours()) return { sent: 0, quiet: true };
  const sb = serviceClient();
  const students = await reachableStudents(sb);
  if (!students.length) return { sent: 0 };
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const [{ data: opening }, { data: due }] = await Promise.all([
    sb.from("tests").select("id,title,opens_at,closes_at,cohort_id,class_id,subject_id").neq("status", "draft").gt("opens_at", iso(now)).lte("opens_at", iso(now + 35 * 6e4)),
    sb.from("assignments").select("id,title,due_at,cohort_id,class_id,subject_id").gt("due_at", iso(now)).lte("due_at", iso(now + 864e5)),
  ]);
  // Who already handed in, for just these tests and assignments (never the whole table).
  const none = Promise.resolve({ data: [] as Array<Record<string, string>> });
  const [{ data: handed }, { data: handedA }] = await Promise.all([
    opening?.length ? sb.from("submissions").select("test_id,student_id").in("test_id", opening.map((t) => t.id)) : none,
    due?.length ? sb.from("assignment_submissions").select("assignment_id,student_id").in("assignment_id", due.map((a) => a.id)) : none,
  ]);
  const done = new Set((handed ?? []).map((h) => `${h.student_id}|${h.test_id}`));
  const doneA = new Set((handedA ?? []).map((h) => `${h.student_id}|${h.assignment_id}`));

  // Student profiles (study times, recordings watched), read once for this run.
  const profiles = await studentProfiles(sb, students.map((s) => s.id));
  const items: Item[] = [
    ...(await resultItems(sb)),
    ...(await classItems(sb, students, now)),
    ...studyItems(students, profiles, now),
    ...(await recordingItems(sb, students, profiles, now)),
  ];
  for (const s of students) {
    for (const t of opening ?? []) {
      if (!covers(t, s) || done.has(`${s.id}|${t.id}`)) continue;
      items.push({ studentId: s.id, kind: "tests", refs: [`open:${t.id}`], ...testOpensCopy(`${s.id}${t.id}`, t.title, pkTime(t.opens_at)), url: "/tests", tag: `test-${t.id}`, priority: 2 });
    }
    for (const a of due ?? []) {
      if (!covers(a, s, true) || doneA.has(`${s.id}|${a.id}`)) continue;
      items.push({ studentId: s.id, kind: "assignments", refs: [`due:${a.id}`], ...assignmentCopy(`${s.id}${a.id}`, a.title, new Date(a.due_at).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })), url: "/assignments", tag: `asg-${a.id}`, priority: 3 });
    }
  }
  return { sent: await deliver(sb, items) };
}

/** Right after Hamza releases results (if it isn't night; otherwise the morning run sends them). */
export async function notifyReleased(submissionIds: string[]): Promise<number> {
  if (!pushReady() || isQuietHours() || !submissionIds.length) return 0;
  const sb = serviceClient();
  return deliver(sb, await resultItems(sb, submissionIds));
}

/**
 * "Your class starts soon": only each student's FIRST class of the day (the
 * rest follow straight on), sent by the run in the 15 minutes before it.
 * Cancelled classes are skipped; students who switched it off get nothing.
 */
async function classItems(sb: SupabaseClient, students: Reach[], now: number): Promise<Item[]> {
  setSchedule(await loadSchedule(sb));
  const today = pkDate(now);
  const [{ data: classes }, { data: subjects }, { data: cc }, { data: cs }, { data: rows }] = await Promise.all([
    sb.from("classes").select("id,name"),
    sb.from("subjects").select("id,name"),
    sb.from("cohort_classes").select("cohort_id,class_id"),
    sb.from("cohort_subjects").select("cohort_id,subject_id"),
    sb.from("students").select("id,user_id"),
  ]);
  const db = {
    classes: (classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, createdAt: "" })),
    subjects: (subjects ?? []).map((x) => ({ id: x.id as string, name: x.name as string, createdAt: "" })),
  };
  const slots = liveSlotsOn(db, today);
  if (!slots.length) return [];
  // Only bother (and only read profiles) when a class is about to start.
  const soon = slots.some((sl) => sl.startMs - now > -3 * 60_000 && sl.startMs - now <= 16 * 60_000);
  if (!soon) return [];

  const off = await classOptOuts(sb, rows ?? []);
  const cohortClasses = new Map<string, Set<string>>();
  for (const r of cc ?? []) cohortClasses.set(r.cohort_id, (cohortClasses.get(r.cohort_id) ?? new Set()).add(r.class_id));
  const cohortSubjects = new Map<string, Set<string>>();
  for (const r of cs ?? []) cohortSubjects.set(r.cohort_id, (cohortSubjects.get(r.cohort_id) ?? new Set()).add(r.subject_id));

  const items: Item[] = [];
  for (const s of students) {
    if (off.has(s.id)) continue;
    // Their own level and subjects, else their cohort's (same rule as the portal).
    const lv = s.classes.size ? s.classes : (cohortClasses.get(s.cohortId ?? "") ?? new Set<string>());
    const sb2 = s.subjects.size ? s.subjects : (cohortSubjects.get(s.cohortId ?? "") ?? new Set<string>());
    const mine = slots.filter((sl) => lv.has(sl.classId) && (!sb2.size || sb2.has(sl.subjectId)));
    const first = mine[0];
    if (!first) continue;
    const lead = first.startMs - now;
    if (lead <= -3 * 60_000 || lead > 16 * 60_000) continue;
    items.push({
      studentId: s.id,
      kind: "classes",
      refs: [`class:${today}`],
      ...classCopy(`${s.id}${today}`, first.subject, clock(first.start), lead > 6 * 60_000 ? "soon" : lead > 60_000 ? "open" : "now"),
      url: "/dashboard",
      tag: `class-${today}`,
      priority: -1,
    });
  }
  return items;
}

/** Students who switched the class reminder off (kept on their profile). */
async function classOptOuts(sb: SupabaseClient, rows: Array<{ id: string; user_id: string | null }>) {
  const byUser = new Map(rows.filter((r) => r.user_id).map((r) => [r.user_id as string, r.id]));
  const out = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) {
      const id = byUser.get(u.id);
      if (id && (u.user_metadata as { profile?: { notifyClasses?: boolean } } | undefined)?.profile?.notifyClasses === false) out.add(id);
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

type StudentProfile = { studySlots?: Array<{ day: number; time: string }>; watched?: string[] };

/** Each student's saved profile, by student id (one pass over the accounts). */
async function studentProfiles(sb: SupabaseClient, ids: string[]): Promise<Map<string, StudentProfile>> {
  const out = new Map<string, StudentProfile>();
  if (!ids.length) return out;
  const { data: rows } = await sb.from("students").select("id,user_id").in("id", ids);
  const byUser = new Map((rows ?? []).filter((r) => r.user_id).map((r) => [r.user_id as string, r.id as string]));
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) {
      const id = byUser.get(u.id);
      const p = (u.user_metadata as { profile?: StudentProfile } | undefined)?.profile;
      if (id && p) out.set(id, p);
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/**
 * Groundwork study times: a reminder in the 15 minutes before each slot a
 * student planned (saved on their profile as studySlots), once per slot.
 */
function studyItems(students: Reach[], profiles: Map<string, StudentProfile>, now: number): Item[] {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const weekday = new Date(`${ymd}T12:00:00+05:00`).getUTCDay();
  const items: Item[] = [];
  for (const s of students) {
    const slots = profiles.get(s.id)?.studySlots;
    if (!Array.isArray(slots)) continue;
    for (const sl of slots) {
      if (sl?.day !== weekday || !/^\d{2}:\d{2}$/.test(sl.time ?? "")) continue;
      const at = Date.parse(`${ymd}T${sl.time}:00+05:00`);
      if (now <= at - 14 * 60_000 || now > at + 60_000) continue;
      const [h, m] = sl.time.split(":").map(Number);
      const label = `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
      items.push({
        studentId: s.id,
        kind: "study",
        refs: [`study:${ymd}:${sl.time}`],
        ...studyCopy(`${s.id}${ymd}${sl.time}`, label),
        url: "/groundwork",
        tag: `study-${ymd}-${sl.time}`,
        priority: 4,
      });
    }
  }
  return items;
}

/**
 * A class recording closing within 5 hours, for students in that class who
 * didn't join it and haven't opened the recording yet. Once per recording.
 */
async function recordingItems(sb: SupabaseClient, students: Reach[], profiles: Map<string, StudentProfile>, now: number): Promise<Item[]> {
  const today = pkDate(now);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now - 864e5);
  const [{ data: links }, { data: classes }, { data: subjects }, { data: joins }, { data: cc }, { data: cs }] = await Promise.all([
    sb.from("class_links").select("on_date,class_id,subject_id,recording_url").in("on_date", [yesterday, today]).not("recording_url", "is", null),
    sb.from("classes").select("id,name"),
    sb.from("subjects").select("id,name"),
    sb.from("class_joins").select("student_id,on_date,class_id,subject_id").in("on_date", [yesterday, today]),
    sb.from("cohort_classes").select("cohort_id,class_id"),
    sb.from("cohort_subjects").select("cohort_id,subject_id"),
  ]);
  // Their own level and subjects, else their cohort's (same rule as the portal).
  const cohortClasses = new Map<string, Set<string>>();
  for (const r of cc ?? []) cohortClasses.set(r.cohort_id, (cohortClasses.get(r.cohort_id) ?? new Set()).add(r.class_id));
  const cohortSubjects = new Map<string, Set<string>>();
  for (const r of cs ?? []) cohortSubjects.set(r.cohort_id, (cohortSubjects.get(r.cohort_id) ?? new Set()).add(r.subject_id));
  if (!links?.length) return [];
  const db = {
    classes: (classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, createdAt: "" })),
    subjects: (subjects ?? []).map((x) => ({ id: x.id as string, name: x.name as string, createdAt: "" })),
  };
  const joined = new Set((joins ?? []).map((j) => `${j.student_id}|${j.on_date}|${j.class_id}|${j.subject_id}`));
  const items: Item[] = [];
  for (const l of links) {
    const slot = liveSlotsOn(db, l.on_date as string).find((x) => x.classId === l.class_id && x.subjectId === l.subject_id);
    if (!slot) continue;
    const closes = slot.endMs + 24 * 3_600_000;
    if (closes <= now || closes - now > 5 * 3_600_000) continue;
    const key = `${l.on_date}|${l.class_id}|${l.subject_id}`;
    for (const s of students) {
      const lv = s.classes.size ? s.classes : (cohortClasses.get(s.cohortId ?? "") ?? new Set<string>());
      const sbj = s.subjects.size ? s.subjects : (cohortSubjects.get(s.cohortId ?? "") ?? new Set<string>());
      if (!lv.has(l.class_id as string) || (sbj.size && !sbj.has(l.subject_id as string))) continue;
      if (joined.has(`${s.id}|${key}`) || profiles.get(s.id)?.watched?.includes(key)) continue;
      items.push({
        studentId: s.id,
        kind: "recordings",
        refs: [`rec:${key}`],
        ...recordingCopy(
          `${s.id}${key}`,
          slot.subject,
          new Date(`${l.on_date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "long" }),
          new Date(closes).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }),
        ),
        url: "/classes",
        tag: `rec-${key}`,
        priority: 1,
      });
    }
  }
  return items;
}
