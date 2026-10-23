import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEVEL_LABEL,
  LINKS_AT_HOUR,
  RECORDING_HOURS,
  addDays,
  levelOf,
  pkDate,
  setSchedule,
  slotsOn as allSlotsOn,
  subjectOf,
  type DayChange,
  type DaySlot,
  type Schedule,
} from "@/lib/timetable";
import { loadSchedule } from "@/lib/schedule-server";
import { RECORDINGS_ROOT, accessToken, closeLinkSharing, createClassEvent, deleteEvent, fileIdOf, findRecording, getEvent, moveEvent } from "@/lib/google";

// Cancelled classes get no link and no recording.
const slotsOn: typeof allSlotsOn = (db, date) => allSlotsOn(db, date).filter((s) => !s.cancelled);

/**
 * Runs with the 15-minute reminder check (and from "Make today's links now"):
 *
 *  1. From 1 pm (or 2 hours before the day's first class, if earlier), every
 *     class without a link gets its own Meet link (a Calendar event on
 *     Hamza's account, with a phone alert 10 minutes before). A link Hamza
 *     pasted by hand is never replaced.
 *  2. From 15 minutes after a class ends (checked every 15 minutes for up to
 *     3 days, since Meet can take 30 to 40 minutes to save it), the recording
 *     is moved to "Hamza Teaches recordings / level / subject" in Drive,
 *     shared "anyone with the link" and added for students.
 *  3. 24 hours after the class ends, link sharing is switched off again, so
 *     students can't save it for later. Anyone Hamza shared the folder with
 *     by email (late joiners) still has access. Recording still has to be
 *     started in Meet.
 */

export const eventTitle = (s: DaySlot) => `${LEVEL_LABEL[s.level]} ${s.subject} · Hamza Teaches`;

interface LinkRow {
  on_date: string;
  class_id: string;
  subject_id: string;
  meet_url: string | null;
  recording_url: string | null;
  event_id: string | null;
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

export async function runClassAutomation(sb: SupabaseClient, now = Date.now(), force = false) {
  const token = await accessToken(sb);
  if (!token) return { connected: false, links: 0, recordings: 0 };
  setSchedule(await loadSchedule(sb));
  const db = await catalogue(sb);

  const today = pkDate(now);
  const from = addDays(today, -3);
  const { data: rows } = await sb.from("class_links").select("*").gte("on_date", from).lte("on_date", today);
  const key = (d: string, c: string, s: string) => `${d}|${c}|${s}`;
  const byKey = new Map(((rows ?? []) as LinkRow[]).map((r) => [key(r.on_date, r.class_id, r.subject_id), r]));
  const save = (s: { date: string; classId: string; subjectId: string }, patch: Partial<LinkRow> & { auto?: boolean }) =>
    sb.from("class_links").upsert(
      { on_date: s.date, class_id: s.classId, subject_id: s.subjectId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "on_date,class_id,subject_id" },
    );

  let links = 0;
  let recordings = 0;

  // 1. Today's links: from 1 pm, or 2 hours before the first class if that's earlier.
  const todays = slotsOn(db, today);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false }).format(now));
  const firstStart = todays.length ? Math.min(...todays.map((s) => s.startMs)) : Infinity;
  if (force || hour >= LINKS_AT_HOUR || now >= firstStart - 2 * 3_600_000) {
    for (const s of todays) {
      if (s.endMs <= now) continue;
      const row = byKey.get(key(s.date, s.classId, s.subjectId));
      if (row?.meet_url) continue;
      try {
        if (row?.event_id) {
          // Made earlier, but Google hadn't finished the Meet link yet.
          const ev = await getEvent(token, row.event_id);
          if (ev.hangoutLink) {
            await save(s, { meet_url: ev.hangoutLink });
            links++;
          }
          continue;
        }
        const ev = await createClassEvent(token, eventTitle(s), new Date(s.startMs).toISOString(), new Date(s.endMs).toISOString());
        await save(s, { event_id: ev.eventId, meet_url: ev.meetUrl, auto: true });
        if (ev.meetUrl) links++;
      } catch (e) {
        console.error("[classes] link", eventTitle(s), e);
      }
    }
  }

  // 2 and 3. Recordings, driven by the links that exist (not today's
  // timetable), so editing the timetable never strands a recording.
  for (const row of (rows ?? []) as LinkRow[]) {
    if (!row.event_id) continue;
    try {
      const slot = allSlotsOn(db, row.on_date).find((s) => s.classId === row.class_id && s.subjectId === row.subject_id);
      let startMs = slot?.startMs ?? 0;
      let endMs = slot?.endMs ?? 0;
      let title = slot ? eventTitle(slot) : "";
      let ev: Awaited<ReturnType<typeof getEvent>> | null = null;
      if (!slot) {
        ev = await getEvent(token, row.event_id);
        startMs = +new Date(ev.start?.dateTime ?? 0);
        endMs = +new Date(ev.end?.dateTime ?? 0);
        title = ev.summary ?? "";
      }
      if (!endMs || now < endMs + 15 * 60_000) continue;
      const closesAt = endMs + RECORDING_HOURS * 3_600_000;
      if (row.recording_url) {
        // Past its 24 hours: close the link (retried for a few hours).
        if (now >= closesAt && now < closesAt + 6 * 3_600_000) {
          const id = fileIdOf(row.recording_url);
          if (id) await closeLinkSharing(token, id);
        }
        continue;
      }
      ev ??= await getEvent(token, row.event_id);
      const level = db.classes.find((c) => c.id === row.class_id);
      const subject = db.subjects.find((x) => x.id === row.subject_id);
      const lvl = level ? levelOf(level) : null;
      const sub = subject ? subjectOf(subject) : null;
      const url = await findRecording(token, ev, title || (ev.summary ?? ""), new Date(startMs - 30 * 60_000).toISOString(), {
        // Found only after its 24 hours: filed for Hamza, never opened to students.
        share: now < closesAt,
        folder: lvl && sub ? [RECORDINGS_ROOT, LEVEL_LABEL[lvl].replace(" / ", " and "), sub] : [RECORDINGS_ROOT, "Other"],
      });
      if (url) {
        await save({ date: row.on_date, classId: row.class_id, subjectId: row.subject_id }, { recording_url: url });
        recordings++;
      }
    } catch (e) {
      console.error("[classes] recording", row.on_date, e);
    }
  }

  return { connected: true, links, recordings };
}

/**
 * Hamza changed one class for one date: keep his Calendar in step, so the
 * 10-minute alert never fires for a cancelled class or at the old time.
 */
export async function syncCalendar(sb: SupabaseClient, schedule: Schedule, c: DayChange) {
  const token = await accessToken(sb);
  if (!token) return;
  setSchedule(schedule);
  const db = await catalogue(sb);
  const classId = db.classes.find((x) => levelOf(x) === c.level)?.id;
  const subjectId = db.subjects.find((x) => subjectOf(x) === c.subject)?.id;
  if (!classId || !subjectId) return;
  const { data: row } = await sb
    .from("class_links")
    .select("event_id,auto")
    .eq("on_date", c.date)
    .eq("class_id", classId)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (!row?.event_id) return;
  const slot = allSlotsOn(db, c.date).find((s) => s.classId === classId && s.subjectId === subjectId);
  if (!slot || slot.cancelled) {
    await deleteEvent(token, row.event_id);
    // Forget the automatic link, so a fresh one is made if the class comes back.
    if (row.auto) await sb.from("class_links").update({ meet_url: null, event_id: null }).eq("on_date", c.date).eq("class_id", classId).eq("subject_id", subjectId);
  } else {
    await moveEvent(token, row.event_id, new Date(slot.startMs).toISOString(), new Date(slot.endMs).toISOString());
  }
}

/**
 * The weekly timetable changed: move or remove today's Calendar events that
 * were already made, so the 10-minute alerts follow the new times.
 */
export async function syncCalendarDay(sb: SupabaseClient, schedule: Schedule, date: string) {
  const token = await accessToken(sb);
  if (!token) return;
  setSchedule(schedule);
  const db = await catalogue(sb);
  const { data: rows } = await sb.from("class_links").select("class_id,subject_id,event_id,auto").eq("on_date", date).not("event_id", "is", null);
  for (const row of rows ?? []) {
    try {
      const slot = allSlotsOn(db, date).find((s) => s.classId === row.class_id && s.subjectId === row.subject_id);
      if (!slot || slot.cancelled) {
        await deleteEvent(token, row.event_id as string);
        if (row.auto) await sb.from("class_links").update({ meet_url: null, event_id: null }).eq("on_date", date).eq("class_id", row.class_id).eq("subject_id", row.subject_id);
      } else {
        await moveEvent(token, row.event_id as string, new Date(slot.startMs).toISOString(), new Date(slot.endMs).toISOString());
      }
    } catch (e) {
      console.error("[classes] weekly sync", e);
    }
  }
}

// ---- Test run (Admin → Classes → "Make a test class") ----------------------
// Lets Hamza try links and recordings before term, without touching students.

export const TEST_TITLE = "Test class · Hamza Teaches";

export async function makeTestClass(sb: SupabaseClient) {
  const token = await accessToken(sb);
  if (!token) return { error: "not connected" };
  const start = Date.now();
  const ev = await createClassEvent(token, TEST_TITLE, new Date(start).toISOString(), new Date(start + 20 * 60_000).toISOString());
  return { eventId: ev.eventId, meetUrl: ev.meetUrl ?? (await getEvent(token, ev.eventId)).hangoutLink ?? null, startedAt: new Date(start).toISOString() };
}

export async function findTestRecording(sb: SupabaseClient, eventId: string, startedAt: string) {
  const token = await accessToken(sb);
  if (!token) return { error: "not connected" };
  const ev = await getEvent(token, eventId);
  const after = new Date(+new Date(startedAt) - 30 * 60_000).toISOString();
  return { recordingUrl: await findRecording(token, ev, TEST_TITLE, after, { share: true, folder: [RECORDINGS_ROOT, "Tests"] }) };
}
