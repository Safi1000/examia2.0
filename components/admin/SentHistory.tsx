"use client";

import { useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { DEMO } from "@/lib/demo";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { addDays, pkDate } from "@/lib/timetable";
import { MUTE_AUTO, MUTE_DAYS, mutedUntil, phoneLabel, sentDay, sentHistory, type SentEntry } from "@/lib/sent-log";

/** How many entries the History shows. */
const SHOW = 8;

type Phone = { label: string; at: number };

const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const quiet = "inline-flex items-center font-semibold text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline pointer-coarse:min-h-11";

/**
 * One quiet line under a student on Today and Tell parents: the last message
 * that went to them or their parent, and a History toggle. History lists the
 * last few messages (Undo for one logged by mistake), the automatic phone
 * reminders of the last 14 days, and "Stop automatic reminders". Owner only:
 * these screens are, and the store refuses the changes for staff anyway.
 */
export function SentHistory({ studentId, nowMs }: { studentId: string; nowMs: number }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<Phone[] | "loading" | "error" | "demo" | null>(null);

  const all = sentHistory(db, studentId);
  const last = all.find((e) => e.message) ?? null;
  const today = pkDate(nowMs);
  const muted = mutedUntil(db, studentId, today);

  async function loadPhone() {
    if (DEMO) return setPhone("demo");
    setPhone("loading");
    try {
      const { data } = await supabase().auth.getSession();
      const res = await fetch(`/api/admin/reminder-log?studentId=${encodeURIComponent(studentId)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        cache: "no-store",
      });
      const j = (await res.json().catch(() => null)) as { items?: Array<{ kind: string; ref: string; sentAt: string }> } | null;
      if (!res.ok || !Array.isArray(j?.items)) return setPhone("error");
      // One notice can cover several refs (results grouped): one line per kind and minute.
      const seen = new Set<string>();
      const list: Phone[] = [];
      for (const x of j.items) {
        const at = Date.parse(x.sentAt);
        if (!Number.isFinite(at)) continue;
        const label = phoneLabel(x.kind, x.ref);
        const k = `${label}|${Math.floor(at / 60_000)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        list.push({ label, at });
      }
      setPhone(list);
    } catch {
      setPhone("error");
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && (phone === null || phone === "error")) void loadPhone();
  }

  function undo(e: SentEntry) {
    for (const r of e.rows) store.unmarkReminderSent(studentId, r.kind, r.ref);
    toast(e.skipped ? "Brought back. It shows again if it is still due." : "Removed from the log.", "success");
  }

  function mute() {
    const until = addDays(today, MUTE_DAYS);
    store.markReminderSent(studentId, MUTE_AUTO, until);
    toast(`Automatic reminders off until ${dayLabel(until)}. Class times, tests opening, results and notices still go.`, "success");
  }

  function unmute() {
    for (const r of db.remindersSent) if (r.studentId === studentId && r.kind === MUTE_AUTO) store.unmarkReminderSent(studentId, r.kind, r.ref);
    toast("Automatic reminders back on.", "success");
  }

  // Messages and the phone reminders together, newest first.
  const phoneList = Array.isArray(phone) ? phone : [];
  const rows: Array<{ key: string; at: number; label: string; entry?: SentEntry }> = [
    ...all.slice(0, SHOW).map((e, i) => ({ key: `m${i}`, at: e.at, label: e.label.charAt(0).toUpperCase() + e.label.slice(1), entry: e })),
    ...phoneList.slice(0, SHOW).map((p, i) => ({ key: `p${i}`, at: p.at, label: p.label })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="mt-1 text-sm text-ink-3">
      <p className="flex flex-wrap items-center gap-x-2">
        <span>{last ? `Last sent: ${last.label}, ${sentDay(last.at)}` : "Nothing sent yet"}</span>
        {muted && <span>· Automatic reminders off until {dayLabel(muted)}</span>}
        <button type="button" onClick={toggle} aria-expanded={open} className={quiet}>
          {open ? "Hide history" : "History"}
        </button>
      </p>
      {open && (
        <div className="mt-2 rounded-field bg-surface-2/40 p-3">
          {rows.length === 0 ? (
            <p>{phone === "loading" ? "Loading." : "No messages or phone reminders yet."}</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5">
                  <span className="min-w-0">
                    <span className="text-ink-2">{r.label}</span> <span className="tabular-nums">· {sentDay(r.at)}</span>
                  </span>
                  {r.entry?.undoable && (
                    <button
                      type="button"
                      onClick={() => undo(r.entry!)}
                      className={quiet}
                      title={r.entry.skipped ? "Show this reminder again" : "Not really sent: take it off the log"}
                    >
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {phone === "loading" && rows.length > 0 && <p className="mt-1">Loading the phone reminders.</p>}
          {phone === "error" && <p className="mt-1">Couldn&apos;t load the phone reminders. Try again later.</p>}
          {phone === "demo" && <p className="mt-1">Phone reminders aren&apos;t in the preview.</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 border-t border-hairline pt-2">
            {muted ? (
              <>
                <span>Automatic reminders are off until {dayLabel(muted)}.</span>
                <button type="button" onClick={unmute} className={quiet}>
                  Turn back on
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={mute} className={quiet}>
                  Stop automatic reminders
                </button>
                <span>for {MUTE_DAYS} days: the come back nudge, recording, study and homework chasers. Class times, tests opening and results still go.</span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
