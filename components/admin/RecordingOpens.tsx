"use client";

import { useMemo, useState } from "react";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useStudentProfiles } from "@/lib/student-profiles";
import { recordingReport, type SlotRecording } from "@/lib/attention";
import { addDays, LEVEL_LABEL, pkDate, useClassLinks } from "@/lib/classes";
import { displayName } from "@/lib/display-name";
import { parentMissedClass, studentMissedClass } from "@/lib/portal-messages";
import { Card, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { panelTitle } from "@/components/admin/surface";

const waTo = (e164: string | undefined, text: string) =>
  e164 ? `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : null;
const TZ = "Asia/Karachi";
const dayShort = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const dayLong = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", timeZone: TZ });
const closeLabel = (ms: number) =>
  `${dayLong(ms)} at ${new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;

/**
 * For Hamza only, on Classes: each recorded class of the last 7 days, with
 * who joined live, who opened the recording instead, and who did neither
 * (with a one tap WhatsApp reminder while the recording is still open).
 * "Opened" is a tap on Watch, not how much they watched.
 */
export function RecordingOpens({ db, students, nowMs }: { db: Database; students: Student[]; nowMs: number }) {
  const today = pkDate(nowMs);
  const from = addDays(today, -7);
  const { links, joins, ready } = useClassLinks(from, today, true, false);
  const profiles = useStudentProfiles();
  const profilesReady = Object.keys(profiles).length > 0;
  const [open, setOpen] = useState<string | null>(null);
  // The sums follow the clock in 5-minute steps, not every 30 s tick.
  const tick = Math.floor(nowMs / 300_000) * 300_000;
  const rows = useMemo(
    () => recordingReport(db, { links, joins, profiles, students, from, to: today, nowMs: tick }),
    [db, links, joins, profiles, students, from, today, tick],
  );
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const k = e.currentTarget.dataset.key ?? null;
    setOpen((cur) => (cur === k ? null : k));
  };

  if (ready === false) return null;
  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <h2 className={panelTitle}>Recordings, last 7 days</h2>
        <p className="mt-1 max-w-[65ch] text-[13px] text-ink-3">
          This shows who opened the recording, not how much they watched. An open only counts while the recording is open to students. Only you see this.
        </p>
      </div>
      {ready === null ? (
        <p className="border-t border-border px-4 py-4 text-sm text-ink-3 sm:px-5">Loading…</p>
      ) : !rows.length ? (
        <p className="border-t border-border px-4 py-4 text-sm text-ink-2 sm:px-5">No recordings from the last 7 days yet.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => {
            const isOpen = open === r.key;
            const summary = profilesReady
              ? `${r.joined.length} joined, ${r.opened.length} opened the recording, ${r.neither.length} did neither`
              : `${r.joined.length} joined, checking who opened the recording`;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  data-key={r.key}
                  onClick={toggle}
                  aria-expanded={isOpen}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.018] sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {r.slot.subject} <span className="font-normal text-ink-3">· {LEVEL_LABEL[r.slot.level]} · {dayShort(r.slot.startMs)}</span>
                    </span>
                    <span className="block text-[13px] tabular-nums text-ink-2">{summary}</span>
                  </span>
                  <Icon.ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-90")} aria-hidden />
                </button>
                {isOpen && <Groups r={r} profilesReady={profilesReady} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Groups({ r, profilesReady }: { r: SlotRecording; profilesReady: boolean }) {
  const names = (list: Student[]) => list.map((s) => displayName(s.username)).join(", ");
  return (
    <div className="space-y-3 border-t border-border bg-surface-2/40 px-4 py-4 text-sm sm:px-5">
      {r.noJoinData && <p className="text-[13px] text-ink-3">No joins or attendance were recorded for this class, so these groups may not be right.</p>}
      <Group title={`Joined live (${r.joined.length})`}>{r.joined.length ? names(r.joined) : "Nobody"}</Group>
      {profilesReady ? (
        <>
          <Group title={`Opened the recording (${r.opened.length})`}>{r.opened.length ? names(r.opened) : "Nobody"}</Group>
          <Group title={`Did neither (${r.neither.length})`}>
            {!r.neither.length ? (
              "Nobody. Everyone caught this class."
            ) : (
              <>
                <span className="mt-1 flex flex-wrap gap-2">
                  {r.neither.map((s) => {
                    // To the student if we have their number, else to the parent (worded for them).
                    const link = !r.open
                      ? null
                      : s.phone
                        ? waTo(
                            s.phone,
                            studentMissedClass({ id: s.id, username: s.username, subject: r.slot.subject, day: dayLong(r.slot.startMs), close: closeLabel(r.closesMs) }),
                          )
                        : waTo(
                            s.whatsapp,
                            parentMissedClass({ id: s.id, username: s.username, subject: r.slot.subject, day: dayLong(r.slot.startMs), close: closeLabel(r.closesMs) }),
                          );
                    return link ? (
                      <a
                        key={s.id}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center rounded-full border border-border-strong px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-3 hover:bg-surface-2 max-md:min-h-11"
                      >
                        Remind {displayName(s.username)}
                      </a>
                    ) : (
                      <span
                        key={s.id}
                        className="inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3 text-sm text-ink-3"
                        title={r.open ? "No number saved" : undefined}
                      >
                        {displayName(s.username)}
                      </span>
                    );
                  })}
                </span>
                {!r.open && <span className="mt-1.5 block text-[13px] text-ink-3">The recording has closed for students.</span>}
              </>
            )}
          </Group>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">Checking who opened the recording…</p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-3">{title}</p>
      <div className="mt-0.5 text-ink-2">{children}</div>
    </div>
  );
}
