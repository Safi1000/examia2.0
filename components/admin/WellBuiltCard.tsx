"use client";

import { useState } from "react";
import type { Database } from "@/lib/data/seed";
import type { Profile } from "@/lib/profile";
import { useStore } from "@/lib/data/store";
import { archivedCohortIds } from "@/lib/data/selectors";
import { displayName, isTestAccount } from "@/lib/display-name";
import { wellBuilt } from "@/lib/portal-messages";
import { currentStats, levelFor, mondayOf } from "@/lib/focus";
import { pkDate } from "@/lib/timetable";
import { DEMO } from "@/lib/demo";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/student/Avatar";
import { Button, Card, Icon, Modal, Textarea } from "@/components/ui";
import { panelTitle } from "@/components/admin/surface";

const MAX_WEEK_MIN = 70 * 60; // anything above this isn't real study time
const NOTE_MAX = 200;

/**
 * This week's Groundwork minutes, believed only as far as they add up: the
 * student's own days this week (at most 16 h a day), never more than the week
 * total. The same rule as the student leaderboard.
 */
function weekMinutes(p: Profile | undefined, nowMs: number) {
  if (!p?.focus) return { minutes: 0, streak: 0 };
  const st = currentStats(p.focus, nowMs);
  const fromDays = Object.entries(st.days ?? {})
    .filter(([d]) => d >= (st.weekOf ?? ""))
    .reduce((n, [, m]) => n + Math.min(960, Math.max(0, Number(m) || 0)), 0);
  const minutes = Math.round(Math.min(MAX_WEEK_MIN, Math.max(0, Number(st.weekMinutes) || 0), fromDays));
  return { minutes, streak: Math.max(0, Number(st.streak) || 0) };
}

const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/** The note Hamza can edit before sending: their own week's focus time when the figure is sane, else without it. */
const draftFor = (id: string, username: string, minutes: number) => wellBuilt({ id, username, minutes, maxMinutes: MAX_WEEK_MIN });

/** Who already got a note this week on this device (a backup for the feed). */
const sentKey = (monday: string) => `ht_well_built_${monday}`;
function sentHere(monday: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(sentKey(monday)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * For Hamza only: the five students who focused most in Groundwork this week,
 * with a one tap "Well built" note to each. Students never see this list or
 * any ranking; the note reaches only the student it is for.
 */
export function WellBuiltCard({ db, profiles, nowMs, cohortId }: { db: Database; profiles: Record<string, Profile>; nowMs: number; cohortId: string | null }) {
  const store = useStore();
  const { toast } = useToast();
  const [compose, setCompose] = useState<{ id: string; name: string; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sentNow, setSentNow] = useState<string[]>([]);

  const today = pkDate(nowMs);
  const monday = mondayOf(today);
  const weekStartMs = Date.parse(`${monday}T00:00:00+05:00`);
  const off = archivedCohortIds(db);
  // Hamza's own test account is never ranked or praised.
  const students = db.students.filter((s) => !off.has(s.cohortId) && !isTestAccount(s) && (cohortId === null || s.cohortId === cohortId));

  // Preview only (npm run dev:demo has no sign-in accounts to read): sample minutes.
  const demoStats = (id: string) => {
    const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
    return { minutes: (h % 9) * 35, streak: h % 6 };
  };
  const statsFor = (id: string) => (DEMO && !Object.keys(profiles).length ? demoStats(id) : weekMinutes(profiles[id], nowMs));

  const top = students
    .map((s) => ({ s, name: displayName(s.username), avatar: profiles[s.id]?.avatar, level: levelFor(Math.max(0, Number(profiles[s.id]?.focus?.totalMinutes) || 0)).index, ...statsFor(s.id) }))
    .filter((x) => x.minutes > 0)
    // Most minutes first; ties by name.
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
    .slice(0, 5);

  const praised = new Set([
    ...db.activities.filter((a) => a.type === "well_built" && a.studentId && +new Date(a.createdAt) >= weekStartMs).map((a) => a.studentId!),
    ...sentHere(monday),
    ...sentNow,
  ]);

  async function send() {
    if (!compose || !compose.text.trim()) return;
    setSending(true);
    try {
      await store.sendWellBuilt(compose.id, compose.text);
      try {
        localStorage.setItem(sentKey(monday), JSON.stringify([...new Set([...sentHere(monday), compose.id])]));
      } catch {}
      setSentNow((v) => [...v, compose.id]);
      toast(`Sent to ${compose.name.split(" ")[0]}.`, "success");
      setCompose(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't send it. Try again.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mt-4 p-5 lg:mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={panelTitle}>Focused most this week</h2>
        <span className="text-xs text-ink-3">Groundwork minutes since Monday · only you see this</span>
      </div>
      {top.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-2">No Groundwork study logged this week yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-border border-t border-border">
          {top.map((x, i) => {
            const done = praised.has(x.s.id);
            return (
              <li key={x.s.id} className="flex items-center gap-3 py-3">
                <span className="w-4 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-3">{i + 1}</span>
                <Avatar id={x.avatar} initials={x.name[0]} level={x.level} className="h-10 w-10 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{x.name}</span>
                  <span className="block text-sm tabular-nums text-ink-3">
                    {fmt(x.minutes)}
                    {x.streak > 1 ? ` · ${x.streak} day streak` : ""}
                  </span>
                </span>
                {done ? (
                  <span className="inline-flex h-11 shrink-0 items-center gap-1.5 px-2 text-sm font-semibold text-success">
                    <Icon.Check className="h-4 w-4" /> Sent this week
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="max-md:h-11"
                    aria-label={`Send ${x.name} a well built note`}
                    onClick={() => setCompose({ id: x.s.id, name: x.name, text: draftFor(x.s.id, x.s.username, x.minutes) })}
                  >
                    Send well built
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Modal
        open={!!compose}
        onClose={() => !sending && setCompose(null)}
        title="Send well built"
        description={compose ? `To ${compose.name}. It shows in their notifications and opens Groundwork.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompose(null)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={() => void send()} loading={sending} disabled={!compose?.text.trim()}>
              Send
            </Button>
          </>
        }
      >
        {compose && (
          <div>
            <Textarea
              label="Your note"
              value={compose.text}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setCompose({ ...compose, text: e.target.value })}
            />
            <p className="mt-1 text-right text-xs tabular-nums text-ink-3">
              {compose.text.length}/{NOTE_MAX}
            </p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
