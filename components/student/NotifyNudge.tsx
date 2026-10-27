"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { enablePush, pushStatus } from "@/lib/push-client";

/**
 * One gentle ask, once: for students who skipped notifications in the
 * welcome flow, or who just opened the portal from their iPhone home screen
 * (the only place iPhone allows them).
 */
export function NotifyNudge() {
  const { profile, updateProfile } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // Onboarding (with its own notifications step) happens on this visit: don't
  // ask again seconds later. The nudge waits for a later visit.
  const [onboardingThisVisit] = useState(() => !profile.onboarded);

  useEffect(() => {
    if (!profile.onboarded || profile.notifyAsked || onboardingThisVisit) return;
    let alive = true;
    const t = setTimeout(() => {
      void pushStatus().then((s) => alive && s === "off" && setShow(true)).catch(() => {});
    }, 2500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [profile.onboarded, profile.notifyAsked, onboardingThisVisit]);

  if (!show) return null;
  const done = () => {
    setShow(false);
    updateProfile({ notifyAsked: true });
  };
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md animate-fade-up rounded-2xl border border-border bg-[#1d2023]/95 p-4 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl md:bottom-6">
      <p className="font-semibold text-ink">Turn on notifications?</p>
      <p className="mt-1 text-sm text-ink-2">Class starting, results, a test about to open, work due tomorrow. Never at night, at most 2 a day.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enablePush();
            } catch {}
            done();
          }}
          className="h-10 flex-1 rounded-full bg-brand text-sm font-semibold text-on-brand disabled:opacity-60"
        >
          Turn on
        </button>
        <button type="button" onClick={done} className="h-10 rounded-full px-4 text-sm font-semibold text-ink-3 hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}
