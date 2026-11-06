"use client";

import { useProgress } from "./progress";

/** A small ring that fills as the student works through a topic's questions. Hidden until they start. */
export function TopicProgress({ ids }: { ids: string[] }) {
  const { seen } = useProgress();
  const done = ids.filter((id) => seen[id]).length;
  if (!done) return null;
  const pct = Math.min(1, done / ids.length);
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0 -rotate-90" aria-label={`${Math.round(pct * 100)}% done`} role="img">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-hairline-strong" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" className={pct >= 1 ? "text-success" : "text-gold"} />
    </svg>
  );
}
