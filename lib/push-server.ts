import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Phone notifications, server side. The rules that keep them quiet:
 *
 *  1. Only three kinds: results out, test opens in 30 min, assignment due
 *     within 24 h (not handed in).
 *  2. Never the same thing twice (notify_log is the memory).
 *  3. At most 3 a day per student (Pakistan day).
 *  4. Nothing between 10 pm and 8 am Pakistan time. Results released at night
 *     go out in the morning; reminders whose moment passed overnight are dropped.
 *  5. Each kind can be switched off by the student (notify_prefs).
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

type Kind = "results" | "tests" | "assignments";
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
  const [{ data: subs }, { data: prefs }, { data: log }] = await Promise.all([
    sb.from("push_subscriptions").select("*").in("student_id", ids),
    sb.from("notify_prefs").select("*").in("student_id", ids),
    sb.from("notify_log").select("student_id,kind,ref,sent_at").in("student_id", ids),
  ]);
  const subsBy = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) subsBy.set(s.student_id, [...(subsBy.get(s.student_id) ?? []), s]);
  const prefBy = new Map((prefs ?? []).map((p) => [p.student_id as string, p as Record<Kind, boolean>]));
  const sent = new Set((log ?? []).map((l) => `${l.student_id}|${l.kind}|${l.ref}`));
  const today = pkDayStart();
  const todayCount = new Map<string, number>();
  for (const l of log ?? []) if ((l.sent_at as string) >= today) todayCount.set(l.student_id as string, (todayCount.get(l.student_id as string) ?? 0) + 1);

  let count = 0;
  for (const it of items.sort((a, b) => a.priority - b.priority)) {
    const devices = subsBy.get(it.studentId);
    if (!devices?.length) continue;
    if (prefBy.get(it.studentId)?.[it.kind] === false) continue;
    const fresh = it.refs.filter((r) => !sent.has(`${it.studentId}|${it.kind}|${r}`));
    if (!fresh.length) continue;
    if ((todayCount.get(it.studentId) ?? 0) >= DAILY_CAP) continue;

    // Remember first, so a retry can never double-send.
    const { error } = await sb
      .from("notify_log")
      .upsert(fresh.map((ref) => ({ student_id: it.studentId, kind: it.kind, ref })), { onConflict: "student_id,kind,ref", ignoreDuplicates: true });
    if (error) continue;
    fresh.forEach((r) => sent.add(`${it.studentId}|${it.kind}|${r}`));
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
    title: list.length === 1 ? "Your result is out" : `${list.length} results are out`,
    body: list.length === 1 ? `${title.get(list[0].test_id) ?? "Your test"} has been marked.` : "Hamza has marked your tests. Tap to see your marks.",
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

  const [{ data: opening }, { data: due }, { data: handed }, { data: handedA }] = await Promise.all([
    sb.from("tests").select("id,title,opens_at,closes_at,cohort_id,class_id,subject_id").neq("status", "draft").gt("opens_at", iso(now)).lte("opens_at", iso(now + 35 * 6e4)),
    sb.from("assignments").select("id,title,due_at,cohort_id,class_id,subject_id").gt("due_at", iso(now)).lte("due_at", iso(now + 864e5)),
    sb.from("submissions").select("test_id,student_id"),
    sb.from("assignment_submissions").select("assignment_id,student_id"),
  ]);
  const done = new Set((handed ?? []).map((h) => `${h.student_id}|${h.test_id}`));
  const doneA = new Set((handedA ?? []).map((h) => `${h.student_id}|${h.assignment_id}`));

  const items: Item[] = [...(await resultItems(sb))];
  for (const s of students) {
    for (const t of opening ?? []) {
      if (!covers(t, s) || done.has(`${s.id}|${t.id}`)) continue;
      items.push({ studentId: s.id, kind: "tests", refs: [`open:${t.id}`], title: "Test opens soon", body: `${t.title} opens at ${pkTime(t.opens_at)}.`, url: "/tests", tag: `test-${t.id}`, priority: 2 });
    }
    for (const a of due ?? []) {
      if (!covers(a, s, true) || doneA.has(`${s.id}|${a.id}`)) continue;
      items.push({ studentId: s.id, kind: "assignments", refs: [`due:${a.id}`], title: "Assignment due tomorrow", body: `${a.title} is due ${new Date(a.due_at).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}.`, url: "/assignments", tag: `asg-${a.id}`, priority: 3 });
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
