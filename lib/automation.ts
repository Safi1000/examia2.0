import type { SupabaseClient } from "@supabase/supabase-js";
import { LEVEL_LABEL, addDays, at, liveSlotsOn, pkDate, setSchedule, slotsOn } from "@/lib/timetable";
import { adminUser, loadSchedule, saveAdminMeta } from "@/lib/schedule-server";
import { accessToken, googleReady } from "@/lib/google";

/**
 * Hands-off jobs run by the 15-minute timer (no AI, no paid services):
 *
 *  - Auto-absent: after a level's last class of the day, anyone in that level
 *    who didn't tap Join and has no mark for the day is marked absent. Only
 *    when somebody did join, so a class that never happened marks nobody.
 *    Hamza can change any mark in Attendance afterwards.
 *  - Auto-release (off unless Hamza turns it on): once a multiple-choice-only
 *    test closes, its handed-in papers are released (they mark themselves),
 *    and the usual "result is out" notification follows.
 *  - Health: the timer records that it ran, so Today can warn when it stops,
 *    when Google needs reconnecting, or when a class has no link or recording.
 *
 * Settings live on Hamza's admin account (server-only), like the timetable.
 */
export interface AutomationSettings {
  autoAbsent: boolean;
  autoRelease: boolean;
}
export const DEFAULT_AUTOMATION: AutomationSettings = { autoAbsent: true, autoRelease: false };

interface AutomationMeta extends Partial<AutomationSettings> {
  /** When the 15-minute timer last ran. */
  cronAt?: string;
}

export async function loadAutomation(sb: SupabaseClient): Promise<AutomationSettings & { cronAt?: string }> {
  const u = await adminUser(sb).catch(() => null);
  const m = ((u?.app_metadata as { automation?: AutomationMeta } | undefined)?.automation ?? {}) as AutomationMeta;
  return { ...DEFAULT_AUTOMATION, ...pick(m), cronAt: m.cronAt };
}

const pick = (m: Partial<AutomationSettings>): Partial<AutomationSettings> => {
  const out: Partial<AutomationSettings> = {};
  if (typeof m.autoAbsent === "boolean") out.autoAbsent = m.autoAbsent;
  if (typeof m.autoRelease === "boolean") out.autoRelease = m.autoRelease;
  return out;
};

export async function saveAutomation(sb: SupabaseClient, callerId: string | null, patch: Partial<AutomationSettings> & { cronAt?: string }) {
  const u = await adminUser(sb).catch(() => null);
  const current = ((u?.app_metadata as { automation?: AutomationMeta } | undefined)?.automation ?? {}) as AutomationMeta;
  const next: AutomationMeta = { ...current, ...pick(patch), ...(patch.cronAt ? { cronAt: patch.cronAt } : {}) };
  await saveAdminMeta(sb, callerId, { automation: next });
  return next;
}

async function catalogue(sb: SupabaseClient) {
  const [{ data: classes }, { data: subjects }] = await Promise.all([
    sb.from("classes").select("id,name,created_at"),
    sb.from("subjects").select("id,name,created_at"),
  ]);
  return {
    classes: (classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, createdAt: c.created_at as string })),
    subjects: (subjects ?? []).map((s) => ({ id: s.id as string, name: s.name as string, createdAt: s.created_at as string })),
  };
}

/**
 * Students who sit a class: their own level and subjects, else their
 * cohort's (same rule as the portal), and only while their cohort is on.
 * `subjectIds` empty means any subject of that level.
 */
export async function studentsIn(sb: SupabaseClient, classId: string, subjectIds: string[]): Promise<string[]> {
  const [{ data: students }, { data: cohorts }, { data: sc }, { data: ss }, { data: cc }, { data: cs }] = await Promise.all([
    sb.from("students").select("id,cohort_id"),
    sb.from("cohorts").select("id,active"),
    sb.from("student_classes").select("student_id,class_id"),
    sb.from("student_subjects").select("student_id,subject_id"),
    sb.from("cohort_classes").select("cohort_id,class_id"),
    sb.from("cohort_subjects").select("cohort_id,subject_id"),
  ]);
  const group = (rows: Array<Record<string, string>> | null, k: string, v: string) => {
    const m = new Map<string, Set<string>>();
    for (const r of rows ?? []) m.set(r[k], (m.get(r[k]) ?? new Set()).add(r[v]));
    return m;
  };
  const off = new Set((cohorts ?? []).filter((c) => c.active === false).map((c) => c.id as string));
  const ownC = group(sc, "student_id", "class_id");
  const ownS = group(ss, "student_id", "subject_id");
  const cohC = group(cc, "cohort_id", "class_id");
  const cohS = group(cs, "cohort_id", "subject_id");
  return (students ?? [])
    .filter((s) => !(s.cohort_id && off.has(s.cohort_id)))
    .filter((s) => {
      const classes = ownC.get(s.id)?.size ? ownC.get(s.id)! : (cohC.get(s.cohort_id ?? "") ?? new Set<string>());
      if (!classes.has(classId)) return false;
      const subjects = ownS.get(s.id)?.size ? ownS.get(s.id)! : (cohS.get(s.cohort_id ?? "") ?? new Set<string>());
      return !subjectIds.length || !subjects.size || subjectIds.some((x) => subjects.has(x));
    })
    .map((s) => s.id as string);
}

/** After each level's last class: mark the no-shows absent (see top). */
async function autoAbsent(sb: SupabaseClient, now: number) {
  const today = pkDate(now);
  const db = await catalogue(sb);
  const byLevel = new Map<string, ReturnType<typeof liveSlotsOn>>();
  for (const s of liveSlotsOn(db, today)) byLevel.set(s.classId, [...(byLevel.get(s.classId) ?? []), s]);
  let marked = 0;
  for (const [classId, block] of byLevel) {
    const lastEnd = Math.max(...block.map((s) => s.endMs));
    // From 10 minutes after the last class, for three hours (the timer runs every 15).
    if (now < lastEnd + 10 * 60_000 || now > lastEnd + 3 * 3_600_000) continue;
    const { data: joins } = await sb.from("class_joins").select("student_id").eq("on_date", today).eq("class_id", classId);
    if (!joins?.length) continue;
    const joined = new Set(joins.map((j) => j.student_id as string));
    const { data: marks } = await sb.from("attendance_days").select("student_id").eq("on_date", today);
    const hasMark = new Set((marks ?? []).map((m) => m.student_id as string));
    const who = (await studentsIn(sb, classId, block.map((s) => s.subjectId))).filter((id) => !joined.has(id) && !hasMark.has(id));
    if (!who.length) continue;
    const { error } = await sb
      .from("attendance_days")
      .upsert(who.map((id) => ({ student_id: id, class_id: classId, on_date: today, status: "absent" })), { onConflict: "student_id,class_id,on_date", ignoreDuplicates: true });
    if (error) console.error("[automation] absent", error.message);
    else marked += who.length;
  }
  return marked;
}

/** Release multiple-choice-only tests that closed in the last day (see top). */
async function autoRelease(sb: SupabaseClient, now: number) {
  const { data: tests } = await sb
    .from("tests")
    .select("id,title,subject,questions(type)")
    .neq("status", "draft")
    .lte("closes_at", new Date(now).toISOString())
    .gte("closes_at", new Date(now - 864e5).toISOString());
  const mcqOnly = (tests ?? []).filter((t) => {
    const qs = (t.questions as Array<{ type: string }> | null) ?? [];
    return qs.length > 0 && qs.every((q) => q.type === "mcq");
  });
  let released = 0;
  for (const t of mcqOnly) {
    const releasedAt = new Date().toISOString();
    const { data: rows, error } = await sb
      .from("submissions")
      .update({ status: "released", released_at: releasedAt })
      .eq("test_id", t.id)
      .eq("status", "submitted")
      .select("id,student_id");
    if (error || !rows?.length) continue;
    released += rows.length;
    // The same "result released" entry Hamza's Release button writes.
    await sb.from("activities").insert(
      rows.map((r) => ({
        type: "result_released",
        title: `Result released for "${t.title}"`,
        description: t.subject,
        student_id: r.student_id,
        test_id: t.id,
        submission_id: r.id,
        link: `/results/${t.id}`,
        audience: "student",
      })),
    );
  }
  return released;
}

/** Everything above, once per timer run. Each part fails on its own. */
export async function runAutomations(sb: SupabaseClient, now = Date.now()) {
  const settings = await loadAutomation(sb);
  setSchedule(await loadSchedule(sb));
  const [absent, released] = await Promise.all([
    settings.autoAbsent ? autoAbsent(sb, now).catch((e) => (console.error("[automation] absent", e), 0)) : 0,
    settings.autoRelease ? autoRelease(sb, now).catch((e) => (console.error("[automation] release", e), 0)) : 0,
  ]);
  await saveAutomation(sb, null, { cronAt: new Date(now).toISOString() }).catch((e) => console.error("[automation] heartbeat", e));
  return { absent, released };
}

export interface HealthIssue {
  /** "google" needs Reconnect; "links" can be fixed with "Make today's links now". */
  kind: "google" | "timer" | "links" | "recording";
  text: string;
}

/** What Today should warn about. Empty when all is well. */
export async function healthCheck(sb: SupabaseClient, now = Date.now()): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];
  const settings = await loadAutomation(sb);
  setSchedule(await loadSchedule(sb));
  const db = await catalogue(sb);
  const today = pkDate(now);

  if (!settings.cronAt || now - +new Date(settings.cronAt) > 40 * 60_000) {
    issues.push({
      kind: "timer",
      text: settings.cronAt
        ? `The 15-minute timer last ran ${new Date(settings.cronAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true })}. Reminders, links and recordings are paused until it runs. Ask the developer to check it.`
        : "The 15-minute timer hasn't run yet since this update. If this stays here after an hour, ask the developer to check it.",
    });
  }

  if (!googleReady()) return issues;
  const { data: acct } = await sb.from("google_account").select("email").eq("id", 1).maybeSingle();
  if (!acct) return issues; // not connected: Classes already shows "Connect Google"
  const token = await accessToken(sb).catch(() => null);
  if (!token) {
    issues.push({ kind: "google", text: "Google has disconnected (a password change or removed access). Reconnect it, or today's classes get no Meet links." });
    return issues;
  }

  // Links: due from 1 pm (or 2 h before the first class).
  const todays = liveSlotsOn(db, today);
  const { data: rows } = await sb.from("class_links").select("on_date,class_id,subject_id,meet_url,recording_url,event_id").gte("on_date", addDays(today, -1)).lte("on_date", today);
  const row = (d: string, c: string, s: string) => (rows ?? []).find((r) => r.on_date === d && r.class_id === c && r.subject_id === s);
  const firstStart = todays.length ? Math.min(...todays.map((s) => s.startMs)) : Infinity;
  const due = Math.min(at(today, "13:20"), firstStart - 100 * 60_000);
  if (now >= due) {
    const missing = todays.filter((s) => s.endMs > now && !row(today, s.classId, s.subjectId)?.meet_url);
    if (missing.length)
      issues.push({ kind: "links", text: `${missing.length === 1 ? "1 class today has" : `${missing.length} classes today have`} no Meet link yet.` });
  }

  // Recordings: 2.5 hours after a class ended with an automatic link, still none in Drive.
  const ended = [...slotsOn(db, addDays(today, -1)), ...todays].filter((s) => !s.cancelled && now > s.endMs + 150 * 60_000 && now < s.endMs + 26 * 3_600_000);
  const noRec = ended.filter((s) => {
    const r = row(s.date, s.classId, s.subjectId);
    return r?.event_id && !r.recording_url;
  });
  if (noRec.length)
    issues.push({
      kind: "recording",
      text: `No recording found for ${noRec.length === 1 ? `${LEVEL_LABEL[noRec[0].level]} ${noRec[0].subject}` : `${noRec.length} recent classes`}. Recording only happens if Record is pressed in Meet.`,
    });
  return issues;
}
