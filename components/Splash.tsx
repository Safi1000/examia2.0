"use client";

import { useEffect, useState } from "react";
import { LogoTight } from "@/components/Brand";

/** Short study tips, in Hamza's voice, shown one at a time while the portal opens. */
const TIPS = [
  "Try the past paper question before you read the notes. It shows you what you don't know yet.",
  "Twenty focused minutes beat an hour with your phone face up.",
  "Read the mark scheme like an examiner. The marks are in the wording.",
  "Explain a topic out loud in a minute. If you can't, that's the one to revise.",
  "Little and often wins. A short session today is better than a long one on Sunday.",
  "Show every step of your working. Method marks add up.",
  "Mixed practice feels harder, and that's why it works.",
];

/**
 * The one loading screen: light passes across the wordmark while a gold line
 * fills and slows, never quite finishing until the page is ready. With `tips`,
 * a short study tip changes every few seconds, so a slow connection still
 * gives them something useful to read. After a while it says it's still working.
 */
export function Splash({ label, tips = false }: { label?: string; tips?: boolean }) {
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const start = Math.floor(Math.random() * TIPS.length);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- random start only on the client, so the server and first render agree
    setI(start);
    const tick = tips ? setInterval(() => setI((n) => (n + 1) % TIPS.length), 3400) : null;
    const late = setTimeout(() => setSlow(true), 8000);
    return () => {
      if (tick) clearInterval(tick);
      clearTimeout(late);
    };
  }, [tips]);

  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoTight className="logo-sheen h-7" />
      <span className="relative mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-white/[0.07]">
        <span className="splash-fill absolute inset-0 overflow-hidden rounded-full bg-gradient-to-r from-brand/60 via-brand to-brand/80" />
      </span>
      <span className={label ? "mt-4 text-sm font-medium text-ink-2" : "sr-only"}>{label ?? "Loading"}</span>
      {tips && (
        <p key={i} className="tip-in mt-8 max-w-xs text-[15px] leading-relaxed text-ink-3" aria-live="off">
          {TIPS[i]}
        </p>
      )}
      <p className={`mt-6 text-xs text-ink-3 transition-opacity duration-700 ${slow ? "opacity-100" : "opacity-0"}`} aria-hidden={!slow}>
        Taking a little longer than usual. Still on it.
      </p>
    </div>
  );
}
