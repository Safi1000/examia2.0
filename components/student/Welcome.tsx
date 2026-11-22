"use client";

import { useEffect, useRef, useState } from "react";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useAuth } from "@/lib/auth-context";
import { AVATARS, TARGETS, WEEKLY_GOALS, type Target } from "@/lib/profile";
import { Avatar } from "@/components/student/Avatar";
import { displayName } from "@/lib/display-name";
import { cn } from "@/lib/cn";
import { NavIcon } from "@/components/nav/NavIcons";
import { NotifyStep } from "@/components/student/NotifyStep";
import { addDays, getSchedule, pkDate, slotsForStudent, spanHere } from "@/lib/timetable";
import { useNow } from "@/hooks/useNow";
import { isAsStudent } from "@/lib/grading";
import { useBackToClose } from "@/components/student/useBackToClose";
import { useFocusTrap } from "@/components/student/useFocusTrap";
import { useInApp } from "@/lib/in-app";
import { VAPID } from "@/lib/push-client";
import { Button } from "@/components/ui/Button";

/** A big option tile, chosen: the neutral off-white step. Gold stays for the Next button. */
// The chosen one gets a clear off-white outline (a shade lighter alone was hard to see), never gold.
const tile = (on: boolean) =>
  on ? "border-ink bg-white/[0.09] text-ink shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-border-strong text-ink-2 hover:border-ink-3 hover:text-ink";

/** The subjects a student takes: their own, else their cohort's, else all. */
export function studentSubjects(db: Database, student: Student): string[] {
  const cohort = db.cohorts.find((c) => c.id === student.cohortId);
  const ids = student.subjectIds.length ? student.subjectIds : (cohort?.subjectIds ?? []);
  const names = (ids.length ? ids.map((id) => db.subjects.find((s) => s.id === id)?.name) : db.subjects.map((s) => s.name)).filter(
    (n): n is string => !!n,
  );
  return [...new Set(names)];
}

/**
 * First sign-in: three quick choices that make the portal theirs (avatar,
 * target grades, weekly study goal). Every step can be skipped; all of it can
 * be changed later in Settings. Nothing is chosen for them: only what they
 * actually pick is saved.
 */
export function Welcome({ db, student }: { db: Database; student: Student }) {
  const { profile, updateProfile } = useAuth();
  const nowMs = useNow();
  const subjects = studentSubjects(db, student);
  const [step, setStep] = useState(0);
  // The phone app asks about notifications itself, so its welcome skips that step.
  const app = useInApp();
  const [avatar, setAvatar] = useState<string | undefined>(profile.avatar);
  const [targets, setTargets] = useState<Record<string, Target>>(() => profile.targets ?? {});
  const [goal, setGoal] = useState<number | undefined>(profile.weeklyGoal);
  const name = displayName(student.username);
  const first = name.split(" ")[0];
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  // When the step last changed: a double tap on Next must not skip the step that has only just appeared.
  const steppedAt = useRef(0);

  const finish = () =>
    updateProfile({
      ...(avatar ? { avatar } : {}),
      ...(Object.keys(targets).length ? { targets } : {}),
      ...(goal ? { weeklyGoal: goal } : {}),
      onboarded: true,
    });

  // The phone's Back button steps back through the welcome, and never skips
  // it by leaving the page underneath.
  useBackToClose(() => {
    if (step > 0) setStep(step - 1);
    return true;
  });
  // Each step's heading takes focus, so screen readers start at the top of it.
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  // Tab stays inside the welcome, and focus returns when it closes.
  useFocusTrap(dialog);
  // Escape skips, the same as Skip.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    finish();
  }

  // For the summary: their classes on the next class day (still to come).
  const today = pkDate(nowMs);
  const nextDay = (() => {
    let d = today;
    for (let i = 0; i < 21; i++, d = addDays(d, 1)) {
      const sl = slotsForStudent(db, student, d);
      if (sl.some((s) => s.endMs > nowMs)) return { date: d, slots: sl };
    }
    return null;
  })();
  const nextDayLabel = !nextDay
    ? ""
    : nextDay.date === today
      ? "Today"
      : `${today < getSchedule().termStarts ? "From " : ""}${new Date(`${nextDay.date}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
  const picked = subjects.filter((sub) => targets[sub]);
  const steps = [
    {
      title: `Welcome, ${first}.`,
      sub: "This is where everything for your classes lives. Here's how it works, in 20 seconds.",
      body: (
        <ul className="surface divide-y divide-hairline rounded-card">
          {[
            { icon: <NavIcon.Classes className="h-6 w-6" />, t: "Join class from Home", d: "A gold Join button appears 5 minutes before each class. One tap and you are in." },
            { icon: <NavIcon.Tests className="h-6 w-6" />, t: "One list of what's due", d: "Tests and homework show on Home with their deadlines. On a phone they sit together under Study, and a number on that tab means something is waiting." },
            { icon: <NavIcon.Progress className="h-6 w-6" />, t: "See where you stand", d: "Your grade, your weak topics and this week's plan, updated after every test." },
          ].map((x) => (
            <li key={x.t} className="flex gap-4 px-5 py-4">
              <span className="mt-0.5 shrink-0 text-ink-2">{x.icon}</span>
              <span>
                <span className="block text-base font-semibold text-ink">{x.t}</span>
                <span className="mt-0.5 block text-sm text-ink-2">{x.d}</span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: "Pick your avatar.",
      sub: "It shows at the top of your portal.",
      body: (
        <div className="grid grid-cols-3 gap-4">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={avatar === a.id}
              aria-label={`Avatar: ${a.label}`}
              onClick={() => setAvatar(a.id)}
              className={cn(
                "aspect-square rounded-full p-1 transition-opacity duration-150",
                avatar === a.id ? "ring-2 ring-ink/80 ring-offset-2 ring-offset-paper" : "opacity-70 hover:opacity-100",
              )}
            >
              <Avatar id={a.id} className="h-full w-full" />
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "What are you aiming for?",
      sub: "Your target grade in each subject. Progress shows how close you are.",
      body: (
        <div className="space-y-4">
          {subjects.map((sub) => (
            <div key={sub}>
              <p className="mb-2 text-base font-semibold text-ink">{sub}</p>
              <div className="grid grid-cols-4 gap-2">
                {TARGETS.filter((t) => t !== "A*" || !isAsStudent(student.id)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={targets[sub] === t}
                    onClick={() => setTargets({ ...targets, [sub]: t })}
                    className={cn(
                      "h-12 rounded-full border text-base font-bold transition-colors duration-150 active:scale-[0.98]",
                      tile(targets[sub] === t),
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "How much will you study each week?",
      sub: "Outside class. Focus keeps count for you.",
      body: (
        <div className="grid grid-cols-2 gap-2.5">
          {WEEKLY_GOALS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={goal === h}
              onClick={() => setGoal(h)}
              className={cn(
                "h-16 rounded-tile border text-lg font-bold transition-colors duration-150 active:scale-[0.98]",
                tile(goal === h),
              )}
            >
              {h} hours
            </button>
          ))}
        </div>
      ),
    },
    // Only where notifications can really be turned on: without the push key
    // this step could only say "coming soon", so it is left out.
    !app && !!VAPID && {
      title: "Stay on top of things.",
      sub: "A quiet note when your class is starting, your result is out, a test is about to open or work is due tomorrow. Never at night, and only a few.",
      body: (
        <NotifyStep />
      ),
    },
    {
      title: "You're set.",
      sub: "Here's your portal, made for you.",
      body: (
        // One card, a row each, split by hairlines.
        <div className="surface divide-y divide-hairline rounded-card">
          <div className="flex items-center gap-4 px-5 py-4">
            <Avatar id={avatar} initials={initials} className="h-14 w-14 text-lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">{name}</p>
              {goal ? <p className="text-sm text-ink-2">{goal} hours of study a week</p> : null}
            </div>
          </div>
          {picked.length > 0 && (
            <div className="px-5 py-4 text-base">
              <p className="label-quiet text-ink-3">Aiming for</p>
              <p className="mt-1 text-ink">{picked.map((sub) => `${targets[sub]} in ${sub}`).join(" · ")}</p>
            </div>
          )}
          {nextDay && (
            <div className="px-5 py-4 text-base">
              <p className="label-quiet text-ink-3">Your classes</p>
              <p className="mt-1 text-ink">
                <span className="font-semibold">{nextDayLabel}:</span> {nextDay.slots.map((sl) => sl.subject).join(", ")},{" "}
                {spanHere(nextDay.date, nextDay.slots[0].start, nextDay.slots[nextDay.slots.length - 1].end)}
              </p>
            </div>
          )}
        </div>
      ),
    },
  ].filter((x) => !!x);
  const s = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  function forward() {
    const now = performance.now();
    if (now - steppedAt.current < 400) return;
    steppedAt.current = now;
    if (last) finish();
    else setStep(step + 1);
  }

  return (
    <div ref={dialog} tabIndex={-1} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-paper outline-none">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200 ease-[var(--ease-out)]", i === step ? "w-8 bg-ink" : i < step ? "w-4 bg-ink-3" : "w-4 bg-surface-2")} />
            ))}
          </div>
          <span className="sr-only">
            Step {step + 1} of {steps.length}
          </span>
          {/* Nothing left to skip on the last step: "Open my portal" is the way on. The space is kept so the dots don't move. */}
          <Button variant="ghost" onClick={finish} className={cn("-mr-3", last && "invisible")} tabIndex={last ? -1 : undefined} aria-hidden={last || undefined}>
            Skip
          </Button>
        </div>

        <div key={step} className="animate-fade-up mt-12 flex-1">
          <h1 id="welcome-title" ref={heading} tabIndex={-1} className="text-title font-bold tracking-[-0.025em] text-ink outline-none">
            {s.title}
          </h1>
          <p className="mt-2 text-base text-ink-2">{s.sub}</p>
          <div className="mt-8">{s.body}</div>
        </div>

        <div className="mt-10 flex gap-3">
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button size="lg" onClick={forward} className="flex-1">
            {last ? "Open my portal" : step === 0 ? "Let's set it up" : "Next"}
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-ink-3">You can change any of this later in Settings.</p>
      </div>
    </div>
  );
}
