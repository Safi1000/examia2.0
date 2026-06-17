"use client";

import { useEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/toast";
import { BUILD_CREDIT, COMPANY_NAME } from "@/lib/config";

/**
 * Client root. Everything below depends on localStorage (mock store + session),
 * so we gate the first paint behind mount to keep server and client markup
 * identical and avoid hydration mismatches. The splash is sub-frame in practice.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    <AuthProvider>
      <ToastProvider>
        <div className="relative z-10 flex min-h-dvh flex-col">
          <div className="flex-1">{children}</div>
          <GlobalFooter />
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}

/** Persistent, understated build credit — present on every screen. */
function GlobalFooter() {
  return (
    <footer className="border-t border-border bg-paper/80 px-4 py-3 text-center">
      <p className="text-xs tracking-wide text-ink-3">{BUILD_CREDIT}</p>
    </footer>
  );
}
