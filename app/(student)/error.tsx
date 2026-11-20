"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { waTextLink } from "@/lib/landing";

/**
 * Shown in place of a student page that crashed, inside the portal's header
 * and dock, instead of a blank white screen. "Try again" re-draws the page
 * (a test's typed answers are kept on the phone, so they come back with it).
 */
export default function StudentError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[student page]", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <Icon.Warn className="h-8 w-8 text-ink-3" />
      <h1 className="mt-3 text-xl font-bold text-ink">This page didn&apos;t open.</h1>
      <p className="mt-1 text-base text-ink-2">Try again, or message me if it keeps happening.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <Icon.Refresh className="h-4 w-4" /> Try again
        </Button>
        <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
          Home
        </Link>
      </div>
      <a
        href={waTextLink("Hi Hamza, a page in the portal isn't opening for me.")}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
      >
        Message me
      </a>
    </div>
  );
}
