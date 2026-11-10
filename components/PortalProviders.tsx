"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider, useToast } from "@/components/toast";
import { getStore } from "@/lib/data/store";
import { ThemeManager } from "@/components/ThemeManager";
import { DataSync } from "@/components/DataSync";

/**
 * The student portal and teacher console's client root: auth (Supabase), the data
 * store, toasts, theme and sync. Loaded only on portal routes (see providers.tsx),
 * so the public pages never download any of it.
 */
export default function PortalProviders({ children }: { children: React.ReactNode }) {
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
      // Technical messages ("addNoteAssignment: duplicate key…") become a plain sentence.
      const technical = /^[a-z][A-Za-z]+: /.test(msg);
      const text = offline ? "Couldn't save just now. Check your internet and try again." : technical ? "Something didn't save. Try again, and if it keeps happening, reload the page." : msg;
      if (technical) console.error("[store]", msg); // the detail stays available for a developer
      const now = Date.now();
      if (text === last && now - lastAt < 6000) return;
      last = text;
      lastAt = now;
      toast(text, msg.startsWith("Some of the portal") ? "info" : "error");
    });
  }, [toast]);
  return null;
}
