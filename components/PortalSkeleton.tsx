"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The first open of the portal: the page's outline, in place, while the data
 * arrives, so the screen never jumps from a splash to a page. After a second
 * a quiet line says what is happening; after eight, that it is still going.
 */
export function PortalSkeleton({ side = "student" }: { side?: "student" | "admin" }) {
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setWaited(1), 1000);
    const b = setTimeout(() => setWaited(2), 8000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const note = (
    <p role="status" aria-live="polite" className={`mt-8 text-sm text-ink-3 transition-opacity duration-500 ${waited ? "opacity-100" : "opacity-0"}`}>
      {waited === 2 ? "Taking a little longer than usual. Still on it." : side === "admin" ? "Getting your console ready." : "Getting your portal ready."}
    </p>
  );
  const cards = (
    <>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-9 w-64 max-w-full" />
      <div className="surface mt-7 rounded-card p-5 sm:p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-2/3" />
        <Skeleton className="mt-5 h-11 w-36 rounded-full" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[0, 1].map((k) => (
          <div key={k} className="surface rounded-card p-5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-5 w-3/4" />
            <Skeleton className="mt-2 h-5 w-1/2" />
          </div>
        ))}
      </div>
    </>
  );
  if (side === "admin")
    return (
      <div className="flex min-h-dvh" aria-busy>
        <aside className="hidden w-56 shrink-0 border-r border-hairline p-5 md:block xl:w-64">
          <Skeleton className="h-6 w-32" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <Skeleton key={k} className="h-8 w-full rounded-[10px]" />
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex h-16 items-center justify-between border-b border-hairline px-4">
            <Skeleton className="h-6 w-28 md:invisible" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
          <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
            {cards}
            {note}
          </div>
        </div>
      </div>
    );
  return (
    <div className="min-h-dvh" aria-busy>
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        {cards}
        {note}
      </div>
    </div>
  );
}
