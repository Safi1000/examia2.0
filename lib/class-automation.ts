import type { SupabaseClient } from "@supabase/supabase-js";
import { LEVEL_LABEL, LINKS_AT_HOUR, RECORDING_HOURS, addDays, pkDate, slotsOn, type DaySlot } from "@/lib/timetable";
import { RECORDINGS_ROOT, accessToken, closeLinkSharing, createClassEvent, fileIdOf, findRecording, getEvent } from "@/lib/google";

/**
 * Runs with the 15-minute reminder check (and from "Make today's links now"):
 *
 *  1. From 1 pm on a class day, every class without a link gets its own Meet
 *     link (a Calendar event on Hamza's account). A link Hamza pasted by hand
 *     is never replaced.
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

export async function runClassAutomation(sb: SupabaseClient, now = Date.now(), force = false) {
  const token = await accessToken(sb);
  if (!token) return { connected: false, links: 0, recordings: 0 };

  const [{ data: classes }, { data: subjects }] = await Promise.all([
    sb.from("classes").select("id,name,created_at"),
    sb.from("subjects").select("id,name,created_at"),
  ]);
  const db = {
    classes: (classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, createdAt: c.created_at as string })),
    subjects: (subjects ?? []).map((s) => ({ id: s.id as string, name: s.name as string, createdAt: s.created_at as string })),
  };

  const today = pkDate(now);
  const from = addDays(today, -3);
  const { data: rows } = await sb.from("class_links").select("*").gte("on_date", from).lte("on_date", today);
  const key = (d: string, c: string, s: string) => `${d}|${c}|${s}`;
  const byKey = new Map(((rows ?? []) as LinkRow[]).map((r) => [key(r.on_date, r.class_id, r.subject_id), r]));
  const save = (s: DaySlot, patch: Partial<LinkRow> & { auto?: boolean }) =>
    sb.from("class_links").upsert(
      { on_date: s.date, class_id: s.classId, subject_id: s.subjectId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "on_date,class_id,subject_id" },
    );

  let links = 0;
  let recordings = 0;

  // 1. Today's links (from 1 pm, or straight away when Hamza asks).
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false }).format(now));
  if (force || hour >= LINKS_AT_HOUR) {
    for (const s of slotsOn(db, today)) {
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

  // 2. Recordings for the last few days' classes.
  for (let d = from; d <= today; d = addDays(d, 1)) {
    for (const s of slotsOn(db, d)) {
      if (now < s.endMs + 15 * 60_000) continue;
      const row = byKey.get(key(s.date, s.classId, s.subjectId));
      const closesAt = s.endMs + RECORDING_HOURS * 3_600_000;
      // 3. Past its 24 hours: close the link (retried for a few hours).
      if (row?.recording_url && now >= closesAt && now < closesAt + 6 * 3_600_000) {
        const id = fileIdOf(row.recording_url);
        if (id) await closeLinkSharing(token, id).catch((e) => console.error("[classes] close", eventTitle(s), e));
        continue;
      }
      if (!row?.event_id || row.recording_url) continue;
      try {
        const ev = await getEvent(token, row.event_id);
        const url = await findRecording(token, ev, eventTitle(s), new Date(s.startMs - 30 * 60_000).toISOString(), {
          // Found only after its 24 hours: filed for Hamza, never opened to students.
          share: now < closesAt,
          folder: [RECORDINGS_ROOT, LEVEL_LABEL[s.level].replace(" / ", " and "), s.subject],
        });
        if (url) {
          await save(s, { recording_url: url });
          recordings++;
        }
      } catch (e) {
        console.error("[classes] recording", eventTitle(s), e);
      }
    }
  }

  return { connected: true, links, recordings };
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
