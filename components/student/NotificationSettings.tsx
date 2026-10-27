"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { device, installed } from "@/lib/push-client";

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
  { key: "results", label: "Results", hint: "When Hamza releases your marks" },
  { key: "tests", label: "Tests", hint: "30 minutes before a test opens" },
  { key: "assignments", label: "Assignments", hint: "The day before it's due, if you haven't handed it in" },
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
    return () => {
      alive = false;
    };
  }, [studentId]);

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
    const before = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error } = await supabase().from("notify_prefs").upsert({ student_id: studentId, ...next, updated_at: new Date().toISOString() });
    if (error) {
      setPrefs(before);
      toast("Couldn't save that. Try again.", "error");
    }
  }

  return (
    <Card className="mt-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Phone notifications</h2>
          <p className="mt-1 text-sm text-ink-3">Only what matters, never at night. At most 2 a day, plus class reminders.</p>
        </div>
        {status === "on" && (
          <Button variant="secondary" size="sm" loading={busy} onClick={() => void turnOff()}>
            Turn off
          </Button>
        )}
        {status === "off" && (
          <Button size="sm" loading={busy} onClick={() => void turnOn()}>
            Turn on
          </Button>
        )}
      </div>

      {status === "iphone" && (
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
          On iPhone, first add this portal to your Home Screen: tap Share, then &quot;Add to Home Screen&quot;. Open it from
          there and come back here.
        </p>
      )}
      {status === "blocked" && (
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.
        </p>
      )}
      {status === "unsupported" && <p className="mt-4 text-sm text-ink-3">This browser can&apos;t show notifications.</p>}
      {status === "notReady" && <p className="mt-4 text-sm text-ink-3">Notifications are coming soon.</p>}

      {status === "on" && (
        <ul className="mt-4 divide-y divide-border">
          {/* The class reminder's switch is kept on the student's profile. */}
          <li className="flex items-center justify-between gap-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-ink">Classes</span>
              <span className="block text-xs text-ink-3">When a class starts</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={profile.notifyClasses !== false}
              aria-label="Classes notifications"
              onClick={() => updateProfile({ notifyClasses: profile.notifyClasses === false })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${profile.notifyClasses !== false ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${profile.notifyClasses !== false ? "left-6" : "left-1"}`} />
            </button>
          </li>
          {/* Groundwork study times and class recordings: also on the profile. */}
          {(
            [
              ["notifyStudy", "Study times", "At your Groundwork study time, if you haven't studied yet that day"],
              ["notifyRecordings", "Class recordings", "A few hours before one closes"],
            ] as const
          ).map(([key, label, hint]) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="block text-xs text-ink-3">{hint}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={profile[key] !== false}
                aria-label={`${label} notifications`}
                onClick={() => updateProfile({ [key]: profile[key] === false })}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${profile[key] !== false ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${profile[key] !== false ? "left-6" : "left-1"}`} />
              </button>
            </li>
          ))}
          {KINDS.map((k) => (
            <li key={k.key} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-ink">{k.label}</span>
                <span className="block text-xs text-ink-3">{k.hint}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[k.key]}
                aria-label={`${k.label} notifications`}
                onClick={() => void setPref(k.key, !prefs[k.key])}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${prefs[k.key] ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[k.key] ? "left-6" : "left-1"}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
