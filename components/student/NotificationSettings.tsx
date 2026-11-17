"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { SectionTitle } from "@/components/student/PortalKit";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { device, installed } from "@/lib/push-client";
import { useInApp } from "@/lib/in-app";

/**
 * "Phone notifications" card in Settings.
 *
 * Kept quiet on purpose (rules live in lib/push-server.ts): never twice, at
 * most 2 a day, 2 hours apart unless a class or test is starting, nothing
 * between 10 pm and 8 am. Each kind can be switched off here.
 */

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Prefs = { results: boolean; tests: boolean; assignments: boolean };
const KINDS: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  { key: "results", label: "Results", hint: "When I release your marks" },
  { key: "tests", label: "Tests", hint: "30 minutes before a test opens" },
  { key: "assignments", label: "Homework", hint: "When I set it, and the day before it's due if you haven't handed it in" },
];

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function NotificationSettings({ studentId }: { studentId: string }) {
  const { toast } = useToast();
  const { profile, updateProfile } = useAuth();
  const [status, setStatus] = useState<"loading" | "unsupported" | "iphone" | "off" | "on" | "blocked" | "notReady">("loading");
  const [prefs, setPrefs] = useState<Prefs>({ results: true, tests: true, assignments: true });
  const [busy, setBusy] = useState(false);
  const app = useInApp();

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ios = device() === "iphone";
      const isInstalled = installed();
      let next: typeof status;
      if (!VAPID) next = "notReady";
      else if (ios && !isInstalled) next = "iphone";
      else if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        next = sub ? "on" : "off";
      }
      const { data } = await supabase().from("notify_prefs").select("results,tests,assignments").eq("student_id", studentId).maybeSingle();
      if (!alive) return;
      if (data) setPrefs(data as Prefs);
      setStatus(next);
    };
    // A failed check never leaves the card stuck on "loading".
    const run = () => check().catch(() => alive && setStatus(VAPID ? "off" : "notReady"));
    void run();
    // Back from the browser's settings (after allowing notifications there):
    // the card catches up by itself instead of still saying blocked.
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [studentId]);

  // The phone app has its own notification switches.
  if (app)
    return (
      <section aria-labelledby="notify-title">
        <SectionTitle id="notify-title">Phone notifications</SectionTitle>
        <p className="surface rounded-card px-5 py-4 text-base text-ink-2 sm:px-6">Notifications for the app are in the Me tab.</p>
      </section>
    );

  async function turnOn() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      // Claims the device for this student (a phone shared by siblings moves over).
      const { error } = await supabase().rpc("claim_push_device", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
      if (error) throw error;
      setStatus("on");
      toast("Notifications on. I'll keep them few.", "success");
    } catch {
      toast("Couldn't turn notifications on. Try again in a moment.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      toast("Couldn’t turn them off. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setPref(key: keyof Prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabase().from("notify_prefs").upsert({ student_id: studentId, ...next, updated_at: new Date().toISOString() });
    if (error) {
      // Put back this one switch only: another switch tapped meanwhile keeps its new state.
      setPrefs((cur) => ({ ...cur, [key]: !value }));
      toast("Couldn't save that. Try again.", "error");
    }
  }

  return (
    // Grouped like iOS Settings: the title and its help line above, the button beside them, one card of rows below.
    <section aria-labelledby="notify-title">
      <SectionTitle
        id="notify-title"
        sub="Only what matters, never at night. At most 2 a day, plus class reminders."
        action={
          status === "on" ? (
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void turnOff()}>
              Turn off
            </Button>
          ) : status === "off" ? (
            // Outlined: on Settings the gold button is Change password, the form's action.
            <Button variant="secondary" size="sm" loading={busy} onClick={() => void turnOn()}>
              Turn on
            </Button>
          ) : undefined
        }
      >
        Phone notifications
      </SectionTitle>
      {/* Off: the title, its line and Turn on say it all, so no empty card. */}
      {status !== "off" && (
      <div className="surface rounded-card">
      {/* Holds the card's shape while this phone is checked, so the card below doesn't jump. */}
      {status === "loading" && (
        <div className="px-5 py-4 sm:px-6" aria-hidden>
          <div className="skeleton h-5 w-2/3 rounded-full" />
        </div>
      )}
      {status === "iphone" && (
        <p className="px-5 py-4 text-base text-ink-2 sm:px-6">
          On iPhone, first add this portal to your Home Screen: tap Share, then &quot;Add to Home Screen&quot;. Open it from
          there and come back here.
        </p>
      )}
      {status === "blocked" && (
        <p className="px-5 py-4 text-base text-ink-2 sm:px-6">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.
        </p>
      )}
      {status === "unsupported" && <p className="px-5 py-4 text-base text-ink-2 sm:px-6">This browser can&apos;t show notifications.</p>}
      {status === "notReady" && <p className="px-5 py-4 text-base text-ink-2 sm:px-6">Notifications are coming soon.</p>}

      {status === "on" && (
        <ul className="divide-y divide-hairline">
          {/* The class reminder's switch is kept on the student's profile. */}
          <li className="flex min-h-16 items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
            <span>
              <span className="block text-base font-semibold text-ink">Classes</span>
              <span className="mt-0.5 block text-sm text-ink-3">When a class starts</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={profile.notifyClasses !== false}
              aria-label="Classes notifications"
              onClick={() => updateProfile({ notifyClasses: profile.notifyClasses === false })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""] ${profile.notifyClasses !== false ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-ink shadow transition-[left] duration-200 ease-[var(--ease-out)] ${profile.notifyClasses !== false ? "left-6" : "left-1"}`} />
            </button>
          </li>
          {/* Groundwork study times and class recordings: also on the profile. */}
          {(
            [
              ["notifyStudy", "Study times", "At your Groundwork study time, if you haven't studied yet that day"],
              ["notifyRecordings", "Class recordings", "A few hours before one closes"],
            ] as const
          ).map(([key, label, hint]) => (
            <li key={key} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
              <span>
                <span className="block text-base font-semibold text-ink">{label}</span>
                <span className="mt-0.5 block text-sm text-ink-3">{hint}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={profile[key] !== false}
                aria-label={`${label} notifications`}
                onClick={() => updateProfile({ [key]: profile[key] === false })}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""] ${profile[key] !== false ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-ink shadow transition-[left] duration-200 ease-[var(--ease-out)] ${profile[key] !== false ? "left-6" : "left-1"}`} />
              </button>
            </li>
          ))}
          {KINDS.map((k) => (
            <li key={k.key} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
              <span>
                <span className="block text-base font-semibold text-ink">{k.label}</span>
                <span className="mt-0.5 block text-sm text-ink-3">{k.hint}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[k.key]}
                aria-label={`${k.label} notifications`}
                onClick={() => void setPref(k.key, !prefs[k.key])}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""] ${prefs[k.key] ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-ink shadow transition-[left] duration-200 ease-[var(--ease-out)] ${prefs[k.key] ? "left-6" : "left-1"}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
      )}
    </section>
  );
}
