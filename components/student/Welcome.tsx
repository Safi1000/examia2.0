"use client";

import { useState } from "react";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useAuth } from "@/lib/auth-context";
import { AVATARS, TARGETS, WEEKLY_GOALS, type Target } from "@/lib/profile";
import { Avatar } from "@/components/student/Avatar";
import { displayName } from "@/lib/display-name";
import { cn } from "@/lib/cn";

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
 * be changed later in Settings.
 */
export function Welcome({ db, student }: { db: Database; student: Student }) {
  const { profile, updateProfile } = useAuth();
  const subjects = studentSubjects(db, student);
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState(profile.avatar ?? AVATARS[0].id);
  const [targets, setTargets] = useState<Record<string, Target>>(() => profile.targets ?? Object.fromEntries(subjects.map((s) => [s, "A" as Target])));
  const [goal, setGoal] = useState<number>(profile.weeklyGoal ?? 5);
  const first = displayName(student.username).split(" ")[0];

  const finish = () => updateProfile({ avatar, targets, weeklyGoal: goal, onboarded: true });
  const steps = [
    {
      title: `Welcome, ${first}.`,
      sub: "Three quick things and your portal is yours. Pick your face first.",
      body: (
        <div className="grid grid-cols-4 gap-3">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={avatar === a.id}
              aria-label={`Avatar ${a.id}`}
              onClick={() => setAvatar(a.id)}
              className={cn(
                "aspect-square rounded-2xl p-1 transition-all",
                avatar === a.id ? "scale-105 ring-2 ring-brand ring-offset-2 ring-offset-paper" : "opacity-70 hover:opacity-100",
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
      sub: "Your target grade in each subject. Home shows how close you are.",
      body: (
        <div className="space-y-4">
          {subjects.map((sub) => (
            <div key={sub}>
              <p className="mb-2 text-sm font-semibold text-ink">{sub}</p>
              <div className="grid grid-cols-4 gap-2">
                {TARGETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={targets[sub] === t}
                    onClick={() => setTargets({ ...targets, [sub]: t })}
                    className={cn(
                      "h-12 rounded-full border text-base font-bold transition-colors",
                      targets[sub] === t ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-2 hover:text-ink",
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
      sub: "Outside class. The study timer on Home counts towards it.",
      body: (
        <div className="grid grid-cols-2 gap-2.5">
          {WEEKLY_GOALS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={goal === h}
              onClick={() => setGoal(h)}
              className={cn(
                "h-16 rounded-2xl border text-lg font-bold transition-colors",
                goal === h ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-2 hover:text-ink",
              )}
            >
              {h} hours
            </button>
          ))}
        </div>
      ),
    },
  ];
  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="fixed inset-0 z-[60] overflow-y-auto bg-paper/97 backdrop-blur-xl">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-8 bg-brand" : i < step ? "w-4 bg-brand/50" : "w-4 bg-surface-2")} />
            ))}
          </div>
          <button type="button" onClick={() => updateProfile({ onboarded: true })} className="h-10 px-2 text-sm font-semibold text-ink-3 hover:text-ink">
            Skip
          </button>
        </div>

        <div key={step} className="animate-fade-up mt-12 flex-1">
          <h1 id="welcome-title" className="text-[1.9rem] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            {s.title}
          </h1>
          <p className="mt-2 text-base text-ink-2">{s.sub}</p>
          <div className="mt-8">{s.body}</div>
        </div>

        <div className="mt-10 flex gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className="h-12 rounded-full border border-border-strong px-6 text-sm font-semibold text-ink">
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="h-12 flex-1 rounded-full bg-brand text-base font-semibold text-on-brand transition hover:brightness-110"
          >
            {last ? "Open my portal" : "Next"}
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-ink-3">You can change any of this later in Settings.</p>
      </div>
    </div>
  );
}
