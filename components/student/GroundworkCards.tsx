"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { currentStats, levelFor } from "@/lib/focus";
import {
  DAYS_TARGETS,
  DAY_SHORT,
  DEFAULT_DAYS_TARGET,
  SLOT_TIMES,
  clock12,
  nextSlot,
  reviewDone,
  reviewQueue,
  sceneFor,
  slotLabel,
  sortSlots,
  weekDays,
  weekStreak,
  type StudySlot,
} from "@/lib/groundwork";
import { ShareMoment } from "@/components/student/ShareMoment";
import { Icon } from "@/components/ui";

const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);
const card = "rounded-[22px] border border-border bg-surface p-5";
const kicker = "text-[10px] font-semibold uppercase tracking-[0.3em] text-brand";

/** This week: one dot per day, the days target, the weekly streak and hours. */
export function WeekCard({ nowMs, name }: { nowMs: number; name: string }) {
  const { profile, updateProfile } = useAuth();
  const target = profile.daysTarget ?? DEFAULT_DAYS_TARGET;
  const days = weekDays(profile.focus, nowMs);
  const streak = weekStreak(profile.focus, target, nowMs);
  const stats = currentStats(profile.focus, nowMs);
  const level = levelFor(stats.totalMinutes ?? 0);
  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={kicker}>Your week</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">
            {streak.thisWeek} of {target} days
          </p>
          <p className="text-sm text-ink-3">
            {fmt(stats.weekMinutes)} this week · {level.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold tabular-nums text-brand">{streak.weeks}</p>
          <p className="text-[11px] text-ink-3">week streak</p>
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-7 gap-1.5" aria-label="Days studied this week">
        {days.map((d, i) => (
          <li key={d.date} className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                d.minutes > 0 ? "bg-brand text-on-brand" : d.isToday ? "border-2 border-brand/60 text-ink" : d.isFuture ? "border border-border text-ink-3" : "bg-surface-2 text-ink-3"
              }`}
              title={d.minutes ? fmt(d.minutes) : "No study"}
            >
              {d.minutes > 0 ? "✓" : ""}
            </span>
            <span className={`text-[11px] ${d.isToday ? "font-semibold text-ink" : "text-ink-3"}`}>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-ink-3">
          Aim for
          <select
            value={target}
            onChange={(e) => updateProfile({ daysTarget: Number(e.target.value) })}
            className="h-8 rounded-full border border-border bg-surface-2 px-2 text-xs font-semibold text-ink"
          >
            {DAYS_TARGETS.map((t) => (
              <option key={t} value={t}>
                {t} days a week
              </option>
            ))}
          </select>
        </label>
        {streak.hit && (
          <ShareMoment
            label="Share my week"
            moment={{ kicker: "Groundwork · this week", big: `${streak.thisWeek} study days`, sub: streak.weeks > 1 ? `${streak.weeks} weeks in a row` : `${fmt(stats.weekMinutes)} of study this week`, name, scene: sceneFor(profile.scene, nowMs) }}
          />
        )}
      </div>
    </section>
  );
}

/** Study times: planned slots, each with a reminder on the phone. */
export function SlotsCard({ nowMs }: { nowMs: number }) {
  const { profile, updateProfile } = useAuth();
  const slots = sortSlots(profile.studySlots ?? []);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("19:00");
  const next = nextSlot(slots, nowMs);

  const startEdit = () => {
    setDays([...new Set(slots.map((s) => s.day))]);
    setTime(slots[0]?.time ?? "19:00");
    setOpen(true);
  };
  const save = () => {
    const out: StudySlot[] = days.map((day) => ({ day, time }));
    updateProfile({ studySlots: out });
    setOpen(false);
  };

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={kicker}>Study times</p>
          <p className="mt-1.5 text-base font-semibold text-ink">
            {next ? (
              <>
                Next: {DAY_SHORT[next.slot.day]} at {clock12(next.slot.time)}
              </>
            ) : (
              "Pick when you’ll study"
            )}
          </p>
          <p className="text-sm text-ink-3">{next ? "Your phone reminds you at each one." : "A set time, every week, is what turns studying into a habit."}</p>
        </div>
        <button type="button" onClick={startEdit} className="shrink-0 rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-ink hover:border-brand/60">
          {slots.length ? "Edit" : "Set times"}
        </button>
      </div>
      {slots.length > 0 && !open && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {slots.map((s, i) => (
            <li key={i} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2">
              {slotLabel(s)}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-4 space-y-4 rounded-2xl bg-surface-2 p-4">
          <div>
            <p className="text-xs font-semibold text-ink-2">Days</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                  className={`h-10 min-w-12 rounded-full px-3 text-sm font-semibold ${days.includes(d) ? "bg-brand text-on-brand" : "border border-border text-ink-2"}`}
                >
                  {DAY_SHORT[d]}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs font-semibold text-ink-2">
            Time
            <select value={time} onChange={(e) => setTime(e.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink">
              {SLOT_TIMES.map((t) => (
                <option key={t} value={t}>
                  {clock12(t)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-on-brand">
              Save
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-sm text-ink-3">
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-ink-3">
            Reminders need notifications on (<Link href="/settings" className="underline">Settings</Link>). No reminders after 10 pm.
          </p>
        </div>
      )}
    </section>
  );
}

/** Review due: weak topics back after 1, 3, 7 and 14 days. */
export function ReviewCard({ weak, nowMs, onStudy }: { weak: Array<{ subject: string; topic: string }>; nowMs: number; onStudy: (t: { subject: string; topic: string }) => void }) {
  const { profile, updateProfile } = useAuth();
  const queue = reviewQueue(weak, profile.reviews, nowMs);
  const due = queue.filter((q) => q.isDue);
  const later = queue.filter((q) => !q.isDue);
  return (
    <section className={card}>
      <p className={kicker}>Review due</p>
      {!weak.length ? (
        <p className="mt-2 text-sm text-ink-2">Topics you lose marks on in tests come back here to review, until they stick.</p>
      ) : !due.length ? (
        <p className="mt-2 text-sm text-ink-2">
          All caught up. {later.length ? `Next review: ${later[0].topic}, ${new Date(`${later[0].due}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}.` : ""}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {due.slice(0, 5).map((q) => (
            <li key={q.key} className="flex items-center justify-between gap-3 py-3">
              <button type="button" onClick={() => onStudy(q)} className="min-w-0 text-left">
                <span className="block truncate font-semibold text-ink">{q.topic}</span>
                <span className="block text-xs text-ink-3">
                  {q.subject} · review {q.step + 1} of 4
                </span>
              </button>
              <button
                type="button"
                onClick={() => updateProfile((p) => ({ reviews: reviewDone(p.reviews, q.key, nowMs) }))}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-sm font-semibold text-ink hover:border-brand/60"
              >
                <Icon.Check className="h-4 w-4" /> Reviewed
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The Sunday review: the week in three numbers, then next week's plan. */
export function SundayReview({ week, nowMs, name }: { week: string; nowMs: number; name: string }) {
  const { profile, updateProfile } = useAuth();
  const target = profile.daysTarget ?? DEFAULT_DAYS_TARGET;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${week}T12:00:00+05:00`);
    d.setUTCDate(d.getUTCDate() + i);
    return profile.focus?.days?.[d.toISOString().slice(0, 10)] ?? 0;
  });
  const studied = days.filter((m) => m > 0).length;
  const minutes = days.reduce((a, b) => a + b, 0);
  const reviewed = Object.values(profile.reviews ?? {}).filter((r) => r.step > 0).length;
  return (
    <section className="rounded-[22px] border border-brand/35 bg-[linear-gradient(135deg,rgba(251,193,89,0.16),rgba(251,193,89,0.03))] p-5">
      <p className={kicker}>Sunday review</p>
      <h2 className="mt-1.5 text-xl font-extrabold tracking-[-0.01em] text-ink">Your week, {name}.</h2>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          [`${studied}/${target}`, "study days"],
          [fmt(minutes), "studied"],
          [String(reviewed), "topics reviewed"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-surface/70 px-2 py-3">
            <dt className="sr-only">{l}</dt>
            <dd className="text-lg font-extrabold text-ink">{v}</dd>
            <dd className="text-[11px] text-ink-3">{l}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-ink-2">
        {studied >= target ? "Target hit. Keep the same times next week." : "Next week, pick times you can keep. Fewer, kept, beats many, missed."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => updateProfile({ weekReviewed: week })} className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand">
          Done, plan set
        </button>
        {studied >= target && (
          <ShareMoment label="Share my week" moment={{ kicker: "Groundwork · my week", big: `${studied} study days`, sub: `${fmt(minutes)} of study`, name, scene: sceneFor(profile.scene, nowMs) }} />
        )}
      </div>
    </section>
  );
}
