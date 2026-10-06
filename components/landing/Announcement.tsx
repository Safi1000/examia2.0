"use client";

import { useState, useSyncExternalStore } from "react";
import { track } from "@/lib/landing";

/** Bump when the wording changes so a new notice shows to everyone again. */
const KEY = "ht-announce-2027-mj";

/**
 * The session notice above the subject picker.
 *
 * Dismissal is remembered per browser, and it renders nothing until that has
 * been read — a banner that flashes in and vanishes on every load is worse than
 * one that appears a beat late.
 */
/** Whether this browser has already dismissed it. Never changes after load, so
 *  the subscription is a no-op; the server says "dismissed" so the markup it
 *  renders matches the first client paint. */
const seenStore = {
  subscribe: () => () => {},
  get: () => {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false; // Private mode: show it, just don't remember the dismissal.
    }
  },
  server: () => true,
};

export function Announcement() {
  const seen = useSyncExternalStore(seenStore.subscribe, seenStore.get, seenStore.server);
  const [hidden, setHidden] = useState(false);

  if (seen || hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* nothing to remember it with — fine */
    }
  }

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 overflow-hidden rounded-[20px] border border-gold-border bg-gold-tint px-6 py-5 text-center sm:flex-row sm:text-left">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-gold opacity-[0.12] blur-2xl"
      />

      <span className="flex items-center gap-2 rounded-full border border-gold-border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
        </span>
        Live
      </span>

      <p className="flex-1 text-[15px] font-semibold text-foreground">
        Free trials are live for the{" "}
        <span className="text-gold">May / June 2027</span> session.
      </p>

      {/* Straight to the picker, not to WhatsApp: a visitor who has not chosen a
          subject yet would otherwise open a chat with nothing to say. */}
      <a
        href="#picker"
        onClick={() => track("announcement_click", {})}
        className="shrink-0 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-[#1b1e21] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        Book now
      </a>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this announcement"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold sm:static sm:h-8 sm:w-8"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
