"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider, useToast } from "@/components/toast";
import { getStore } from "@/lib/data/store";
import { ThemeManager } from "@/components/ThemeManager";
import { DataSync } from "@/components/DataSync";
import { BUILD_CREDIT, COMPANY_NAME } from "@/lib/config";

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
          <GlobalFooter />
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}

/** Routes background persistence failures from the data seam to a toast. */
function StoreErrorBridge() {
  const { toast } = useToast();
  useEffect(() => {
    getStore().setErrorReporter((msg) => toast(msg, "error"));
  }, [toast]);
  return null;
}

/** Persistent, understated build credit — present on every screen. */
function GlobalFooter() {
  return (
    <footer className="border-t border-border bg-paper/80 px-4 py-3 text-center">
      <p className="text-xs tracking-wide text-ink-3">{BUILD_CREDIT}</p>
    </footer>
  );
}
