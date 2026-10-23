"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/public-paths";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider, useToast } from "@/components/toast";
import { getStore } from "@/lib/data/store";
import { ThemeManager } from "@/components/ThemeManager";
import { DataSync } from "@/components/DataSync";
import { COMPANY_NAME } from "@/lib/config";

/**
 * Client root. Everything below depends on localStorage (mock store + session),
 * so we gate the first paint behind mount to keep server and client markup
 * identical and avoid hydration mismatches. The splash is sub-frame in practice.
 */
/** True only after hydration. No setState-in-effect; the server snapshot is false. */
const subscribeNoop = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const mounted = useHydrated();
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return (
      <div data-site="public" className="relative z-10 flex min-h-dvh flex-col">
        <div className="flex-1">{children}</div>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper" aria-hidden>
        <span className="font-display text-lg font-extrabold tracking-tight text-brand">
          {COMPANY_NAME}
        </span>
      </div>
    );
  }

  return (
    <ToastProvider>
      <StoreErrorBridge />
      <AuthProvider>
        <ThemeManager />
        <DataSync />
        <div className="relative z-10 flex min-h-dvh flex-col">
          <div className="flex-1">{children}</div>
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}

/**
 * Routes background persistence failures from the data seam to a toast.
 * A weak signal can fail several saves at once: they become one plain
 * message, and the same message isn't repeated within a few seconds.
 */
function StoreErrorBridge() {
  const { toast } = useToast();
  useEffect(() => {
    let last = "";
    let lastAt = 0;
    getStore().setErrorReporter((msg) => {
      const offline = /fetch|network|timed? ?out|load failed|connection/i.test(msg) && !msg.startsWith("Some of the portal");
      const text = offline ? "Couldn't save just now. Check your internet and try again." : msg;
      const now = Date.now();
      if (text === last && now - lastAt < 6000) return;
      last = text;
      lastAt = now;
      toast(text, msg.startsWith("Some of the portal") ? "info" : "error");
    });
  }, [toast]);
  return null;
}
