"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { NotifyStep } from "@/components/student/NotifyStep";
import { enablePush, pushStatus, type PushStatus } from "@/lib/push-client";
import { useInApp } from "@/lib/in-app";

const HIDE_KEY = "ht-notify-card-later";

/**
 * On Home until this phone has reminders on: the one thing that makes sure a
 * student hears about every class. A student can say "Later" and it returns
 * the next day. iPhone and blocked phones get the steps for their case.
 */
export function NotifyCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | "loading" | "later">("loading");
  const [steps, setSteps] = useState(false);
  const [busy, setBusy] = useState(false);
  // The phone app has its own notifications (in its Me tab).
  const app = useInApp();

  useEffect(() => {
    let alive = true;
    void pushStatus()
      .then((s) => {
        if (!alive) return;
        let later = false;
        try {
          later = Date.now() - Number(localStorage.getItem(HIDE_KEY) ?? 0) < 86_400_000;
        } catch {}
        setStatus(later && s !== "on" ? "later" : s);
      })
      .catch(() => alive && setStatus("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  if (app || (status !== "off" && status !== "iphone" && status !== "blocked")) return null;

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush();
      setStatus(next);
      if (next === "on") toast("Reminders are on. I'll let you know before each class.", "success");
    } catch {
      toast("Couldn't turn them on. Try again in a moment.", "error");
    } finally {
      setBusy(false);
    }
  }
  const later = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now()));
    } catch {}
    setStatus("later");
  };

  const copy =
    status === "off"
      ? { title: "Never miss a class", body: "I'll send a short reminder when your class is about to start, and tell you when results are out. Never at night." }
      : status === "iphone"
        ? { title: "Class reminders on iPhone", body: "iPhone only allows reminders from the Home Screen. It takes a minute to set up." }
        : { title: "Reminders are blocked on this phone", body: "Allow notifications for this site in your browser settings, then reload." };

  return (
    <section className="surface rounded-xl px-5 py-5 sm:px-6" aria-label="Class reminders">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{copy.title}</p>
          <p className="mt-1 text-base text-pretty text-ink-2">{copy.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status === "off" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void turnOn()}
              className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand transition-opacity disabled:opacity-60"
            >
              {busy ? "Turning on…" : "Turn on reminders"}
            </button>
          ) : (
            <button type="button" onClick={() => setSteps((v) => !v)} aria-expanded={steps} className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand">
              {steps ? "Hide steps" : "Show me how"}
            </button>
          )}
          <button type="button" onClick={later} className="h-11 rounded-full px-3 text-sm font-semibold text-ink-3 hover:text-ink">
            Later
          </button>
        </div>
      </div>
      {steps && status !== "off" && (
        <div className="mt-3">
          <NotifyStep />
        </div>
      )}
    </section>
  );
}
