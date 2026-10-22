"use client";

import { useEffect, useState } from "react";
import { device, enablePush, pushStatus, type Device, type PushStatus } from "@/lib/push-client";
import { cn } from "@/lib/cn";

/**
 * Welcome-flow step: turn on notifications, with the right steps for the
 * phone in the student's hand. iPhone only allows them once the portal is on
 * the home screen, so it walks them through that first.
 */
export function NotifyStep() {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [dev, setDev] = useState<Device>("other");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void pushStatus()
      .then((s) => {
        if (!alive) return;
        setDev(device());
        setStatus(s);
      })
      .catch(() => alive && setStatus("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      setStatus(await enablePush());
    } catch {
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  const box = "rounded-2xl border border-border bg-surface p-5";
  if (status === "loading") return <div className={cn(box, "h-28 animate-pulse")} />;

  if (status === "on")
    return (
      <div className={cn(box, "flex items-center gap-3")}>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-lg text-success">✓</span>
        <p className="font-semibold text-ink">Notifications are on for this phone.</p>
      </div>
    );

  if (status === "iphone")
    return (
      <div className={box}>
        <p className="font-semibold text-ink">On iPhone, two quick steps first</p>
        <ol className="mt-4 space-y-3.5 text-sm text-ink-2">
          {[
            <>
              Tap <ShareIcon /> <span className="font-semibold text-ink">Share</span> at the bottom of Safari.
            </>,
            <>
              Scroll down and tap <span className="font-semibold text-ink">Add to Home Screen</span>, then <span className="font-semibold text-ink">Add</span>.
            </>,
            <>
              Open <span className="font-semibold text-ink">Hamza Teaches</span> from your home screen and sign in. You&apos;ll be asked about notifications there.
            </>,
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-on-brand">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-ink-3">Using Chrome on iPhone? Open this page in Safari for these steps.</p>
      </div>
    );

  if (status === "blocked")
    return (
      <div className={box}>
        <p className="font-semibold text-ink">Notifications are blocked</p>
        <p className="mt-1.5 text-sm text-ink-2">
          {dev === "android"
            ? "Tap the lock icon next to the address, then Permissions → Notifications → Allow. Then come back here."
            : "Allow notifications for this site in your browser settings, then come back here."}
        </p>
      </div>
    );

  if (status === "unsupported" || status === "notReady")
    return (
      <div className={box}>
        <p className="text-sm text-ink-2">
          {status === "notReady" ? "Notifications are coming soon." : "This browser can't show notifications. On Android, use Chrome. On iPhone, use Safari."}
        </p>
      </div>
    );

  return (
    <div className={box}>
      <button
        type="button"
        onClick={() => void turnOn()}
        disabled={busy}
        className="h-12 w-full rounded-full bg-brand text-base font-semibold text-on-brand transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "One moment…" : "Turn on notifications"}
      </button>
      <p className="mt-3 text-center text-xs text-ink-3">Your phone will ask you to allow them. Tap Allow.</p>
      {dev === "android" && (
        <p className="mt-4 text-xs text-ink-3">
          Tip: tap ⋮ in Chrome, then <span className="font-semibold text-ink-2">Add to Home screen</span>, so the portal opens like an app.
        </p>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 -translate-y-0.5 text-info" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
