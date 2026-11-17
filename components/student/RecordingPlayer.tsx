"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";

/**
 * A class recording, played inside the portal: Google Drive's own player in a
 * frame, full screen over the page. While it is open and on screen the seconds
 * are counted and handed back (once a minute, and when it closes).
 */
export function RecordingPlayer({
  fileId,
  url,
  title,
  sub,
  onTime,
  onClose,
}: {
  fileId: string;
  url: string;
  title: string;
  sub: string;
  onTime: (seconds: number) => void;
  onClose: () => void;
}) {
  const pending = useRef(0);
  const send = useRef(onTime);
  useEffect(() => {
    send.current = onTime;
  }, [onTime]);

  useEffect(() => {
    const flush = () => {
      if (pending.current < 1) return;
      send.current(pending.current);
      pending.current = 0;
    };
    let last = Date.now();
    const tick = window.setInterval(() => {
      const now = Date.now();
      // Only while the page is on screen. A long gap means the phone slept: not counted.
      if (document.visibilityState === "visible" && now - last < 5000) pending.current += (now - last) / 1000;
      last = now;
      if (pending.current >= 60) flush();
    }, 1000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      flush();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={`${title} recording`}>
      <div className="flex items-center justify-between gap-3 bg-bg px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-6">
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-ink">{title}</span>
          <span className="block truncate text-sm text-ink-3">{sub}</span>
        </span>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
        >
          <Icon.Close className="h-4 w-4" /> Close
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <iframe
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          title={`${title} recording`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
        {/* Covers Drive's "open in a new window" corner, so the class stays in the portal. */}
        <div className="absolute right-0 top-0 h-14 w-14" aria-hidden />
      </div>
      <p className="bg-bg px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-3 sm:px-6">
        Not playing?{" "}
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-ink-2 underline">
          Open it in Google Drive
        </a>
      </p>
    </div>
  );
}
