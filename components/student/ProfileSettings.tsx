"use client";

import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useAuth } from "@/lib/auth-context";
import { AVATARS, TARGETS, WEEKLY_GOALS, type Target } from "@/lib/profile";
import { Avatar } from "@/components/student/Avatar";
import { studentSubjects } from "@/components/student/Welcome";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Settings → "Your portal": the same choices as the welcome flow, saved as you tap. */
export function ProfileSettings({ db, student }: { db: Database; student: Student }) {
  const { profile, updateProfile } = useAuth();
  const subjects = studentSubjects(db, student);
  const chip = (on: boolean) =>
    cn("h-10 rounded-full border px-3 text-sm font-semibold transition-colors", on ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-2 hover:text-ink");

  return (
    <Card className="mt-5 space-y-6 p-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Your portal</h2>
        <p className="mt-1 text-sm text-ink-3">Saved as soon as you tap.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Avatar</p>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={profile.avatar === a.id}
              aria-label={`Avatar ${a.id}`}
              onClick={() => updateProfile({ avatar: a.id })}
              className={cn("rounded-xl p-0.5", profile.avatar === a.id ? "ring-2 ring-brand" : "opacity-70 hover:opacity-100")}
            >
              <Avatar id={a.id} className="h-11 w-11" />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">Target grades</p>
        {subjects.map((sub) => (
          <div key={sub} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-ink-2">{sub}</span>
            <div className="flex gap-1.5">
              {TARGETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={profile.targets?.[sub] === t}
                  onClick={() => updateProfile({ targets: { ...profile.targets, [sub]: t as Target } })}
                  className={cn(chip(profile.targets?.[sub] === t), "w-12 px-0")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">Weekly study goal (outside class)</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKLY_GOALS.map((h) => (
            <button key={h} type="button" aria-pressed={profile.weeklyGoal === h} onClick={() => updateProfile({ weeklyGoal: h })} className={chip(profile.weeklyGoal === h)}>
              {h} hours
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
