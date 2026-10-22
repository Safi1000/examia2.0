"use client";

import type { Test } from "@/types";

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * "Add to calendar" for an upcoming test: a standard .ics file the phone's
 * calendar opens, with a reminder an hour before it opens.
 */
export function AddToCalendar({ test }: { test: Test }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hamza Teaches//Portal//EN",
    "BEGIN:VEVENT",
    `UID:${test.id}@hamzateaches.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(test.opensAt)}`,
    `DTEND:${stamp(new Date(new Date(test.opensAt).getTime() + test.durationMinutes * 60_000).toISOString())}`,
    `SUMMARY:Test: ${test.title.replace(/[,;]/g, " ")}`,
    `DESCRIPTION:${test.durationMinutes} minutes. Open it in the Hamza Teaches portal. Closes ${new Date(test.closesAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`,
    `URL:${origin}/test/${test.id}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Test opens in 1 hour",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return (
    <a
      href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
      download={`${test.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 transition-colors hover:text-brand"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4M12 13v4M10 15h4" />
      </svg>
      Add to calendar
    </a>
  );
}
