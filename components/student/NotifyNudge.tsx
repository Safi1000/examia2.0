"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/toast";
import { enablePush, pushStatus } from "@/lib/push-client";
import { useInApp } from "@/lib/in-app";

/**
 * One gentle ask, once: for students who skipped notifications in the
 * welcome flow, or who just opened the portal from their iPhone home screen
 * (the only place iPhone allows them).
 */
export function NotifyNudge() {
  const { profile, updateProfile } = useAuth();
  const { toast } = useToast();
  // Home has its own reminders card (NotifyCard) saying the same thing: never both at once.
  const onHome = usePathname() === "/dashboard";
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // The phone app has its own notifications (in its Me tab).
  const app = useInApp();
  // Onboarding (with its own notifications step) happens on this visit: don't
  // ask again seconds later. The nudge waits for a later visit.
  const [onboardingThisVisit] = useState(() => !profile.onboarded);
  const count = profile.notifyAskCount ?? (profile.notifyAsked ? 1 : 0);
  const askedAt = profile.notifyAskedAt ?? 0;

  useEffect(() => {
    // Asked at most three times, three days apart: calm, but nobody is forgotten.
    if (onHome || !profile.onboarded || onboardingThisVisit || count >= 3 || Date.now() - askedAt < 3 * 86_400_000) return;
    let alive = true;
    const t = setTimeout(() => {
      void pushStatus().then((s) => alive && s === "off" && setShow(true)).catch(() => {});
    }, 2500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [onHome, profile.onboarded, onboardingThisVisit, count, askedAt]);

  if (!show || app || onHome) return null;
  const done = () => {
    setShow(false);
    updateProfile({ notifyAsked: true, notifyAskedAt: Date.now(), notifyAskCount: count + 1 });
  };
  return (
    // Phones: clear of the dock and its raised middle button, and of the home-bar area.
    <div
      role="region"
      aria-label="Class reminders"
      className="fixed inset-x-3 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md animate-fade-up rounded-2xl border border-border bg-[#1d2023]/95 p-4 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl md:bottom-6"
    >
      <p className="font-semibold text-ink">Never miss a class</p>
      <p className="mt-1 text-sm text-ink-2">I&apos;ll send a short reminder when your class is about to start, and tell you when results are out. Never at night, and only a few.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            // Say how it went: before, a failed or blocked attempt closed the card as if it had worked.
            try {
              const next = await enablePush();
              if (next === "on") toast("Reminders are on. I'll let you know before each class.", "success");
              else if (next === "blocked") toast("Notifications are blocked on this phone. Allow them in your browser settings.", "info");
            } catch {
              toast("Couldn't turn them on. You can try again in Settings.", "error");
            }
            done();
          }}
          className="h-11 flex-1 rounded-full bg-brand text-sm font-semibold text-on-brand disabled:opacity-60"
        >
          {busy ? "Turning on…" : "Turn on reminders"}
        </button>
        <button type="button" disabled={busy} onClick={done} className="h-11 rounded-full px-4 text-sm font-semibold text-ink-3 hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}
