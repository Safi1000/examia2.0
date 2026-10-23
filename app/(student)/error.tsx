"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";

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
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <Icon.Warn className="h-8 w-8 text-ink-3" />
      <h1 className="mt-3 text-xl font-bold text-ink">Something went wrong on this page.</h1>
      <p className="mt-1 text-sm text-ink-2">Try again, or go back to Home.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <Icon.Refresh className="h-4 w-4" /> Try again
        </Button>
        <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
          Home
        </Link>
      </div>
    </main>
  );
}
