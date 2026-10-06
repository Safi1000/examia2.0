"use client";

import { useState } from "react";
import { track } from "@/lib/landing";

/**
 * The session notice under the nav.
 *
 * Closing it is for the visitor's current read only — a refresh brings it back.
 * Nothing is remembered, so a notice this short-lived never goes stale in
 * someone's browser storage.
 */
export function Announcement() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 overflow-hidden rounded-[20px] border border-gold-border bg-[rgba(33,36,39,0.92)] px-6 py-4 text-center shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:flex-row sm:text-left">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gold-tint" />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-gold opacity-[0.12] blur-2xl"
      />

      <span className="relative flex items-center gap-2 rounded-full border border-gold-border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
        </span>
        Live
      </span>

      <p className="relative flex-1 text-[15px] font-semibold text-foreground">
        Free trials are live for the{" "}
        <span className="text-gold">May / June 2027</span> session.
      </p>

      {/* Straight to the picker, not to WhatsApp: a visitor who has not chosen a
          subject yet would otherwise open a chat with nothing to say. */}
      <a
        href="#picker"
        onClick={() => track("announcement_click", {})}
        className="relative shrink-0 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-[#1b1e21] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      >
        Book now
      </a>

      <button
        type="button"
        onClick={() => setHidden(true)}
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
