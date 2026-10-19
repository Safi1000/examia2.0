"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

declare global {
  interface Window {
    __htNeedsConsent?: boolean;
    __htLoadPixel?: () => void;
  }
}

const KEY = "ht-cookies";

/**
 * Asks UK and EU visitors (detected by time zone in the pixel snippet, see
 * MetaPixel.tsx) before the advertising cookie loads. Everyone else never sees
 * it. The answer is remembered on this device.
 */
export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {}
    const id = setTimeout(() => setShow(!!window.__htNeedsConsent && !stored), 1200);
    return () => clearTimeout(id);
  }, []);

  const answer = (yes: boolean) => {
    try {
      localStorage.setItem(KEY, yes ? "yes" : "no");
    } catch {}
    if (yes) window.__htLoadPixel?.();
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie choice"
      className="fixed bottom-3 left-3 right-20 z-[45] rounded-2xl border border-hairline-strong bg-[rgba(33,36,39,0.92)] p-4 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:bottom-7 sm:left-7 sm:right-auto sm:max-w-sm"
    >
      <p className="text-sm leading-relaxed text-body">
        I use one advertising cookie to see which ads bring students here. Is that okay?{" "}
        <Link href="/privacy" className="text-gold underline-offset-2 hover:underline">
          Privacy policy
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => answer(true)}
          className="inline-flex min-h-10 items-center rounded-full bg-gold px-4 text-sm font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          That&apos;s fine
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="inline-flex min-h-10 items-center rounded-full border border-hairline-strong px-4 text-sm font-semibold text-body transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}

/** For the privacy page: forget the stored choice so the banner asks again. */
export function CookieChoiceReset() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem(KEY);
        } catch {}
        setDone(true);
        setTimeout(() => window.location.reload(), 400);
      }}
      className="inline-flex min-h-10 items-center rounded-full border border-hairline-strong px-4 text-sm font-semibold text-body transition-colors hover:border-gold-border hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {done ? "Cleared. Reloading..." : "Change my cookie choice"}
    </button>
  );
}
