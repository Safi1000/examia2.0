"use client";

import Link from "next/link";
import { useProgress } from "./progress";

/** "Pick up where you left off": the last papers opened on this device. Hidden until there are some. */
export function ContinueStrip() {
  const { recent, done } = useProgress();
  if (!recent.length) return null;
  const finished = Object.keys(done).length;
  return (
    <section aria-labelledby="continue-h" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="continue-h" className="text-lg font-semibold text-foreground">
          Pick up where you left off
        </h2>
        {finished > 0 && (
          <p className="hidden text-sm tabular-nums text-muted-foreground sm:block">
            {finished} {finished === 1 ? "paper" : "papers"} done on this device
          </p>
        )}
      </div>
      <ul className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
        {recent.map((r) => (
          <li key={r.u} className="w-[240px] shrink-0 snap-start">
            <Link href={r.u} className="pc-surface pc-surface-link block h-full rounded-tile px-4 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              <span className="block text-base font-semibold tabular-nums text-foreground">{r.c}</span>
              <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-muted-foreground">{r.l}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
