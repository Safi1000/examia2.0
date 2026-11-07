"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Shown in place of a console page that crashed, inside the sidebar and
 * header, instead of a blank screen. "Try again" re-draws the page.
 */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[admin page]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <Icon.Warn className="h-8 w-8 text-ink-3" />
      <h1 className="mt-3 text-xl font-bold text-ink">This page didn&apos;t load.</h1>
      <p className="mt-1 text-sm text-ink-2">Try again, or go back to Today. Nothing you saved is lost.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <Icon.Refresh className="h-4 w-4" /> Try again
        </Button>
        <Link href="/admin/today" className={buttonClasses({ variant: "secondary" })}>
          Today
        </Link>
      </div>
    </div>
  );
}
