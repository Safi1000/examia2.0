"use client";

import { ScheduleGate } from "@/components/ScheduleGate";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDataReady } from "@/lib/data/store";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useToast } from "@/components/toast";
import { AdminFilterProvider } from "@/lib/admin-filter";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { Sidebar } from "@/components/admin/Sidebar";
import { Icon } from "@/components/ui";
import { LogoTight } from "@/components/Brand";
import { NotificationBell } from "@/components/NotificationBell";
import { PortalAmbient } from "@/components/PortalAmbient";
import { pageTitle, useDocumentTitle } from "@/hooks/usePageTitle";

const IDLE_MS = 30 * 60 * 1000; // 30-minute idle session timeout

const TITLES: Record<string, string> = {
  "/admin/today": "Today",
  "/admin/tests": "Tests",
  "/admin/submissions": "Submissions",
  "/admin/grading": "Marking",
  "/admin/assignments": "Assignments",
  "/admin/bank": "Question bank",
  "/admin/notes": "Notes",
  "/admin/announcements": "Announcements",
  "/admin/roster": "Roster",
  "/admin/cohorts": "Cohorts",
  "/admin/attendance": "Attendance",
  "/admin/analytics": "Analytics",
  "/admin/export": "Export",
  "/admin/settings": "Settings",
  "/admin/notifications": "Notifications",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, initializing } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const ready = useDataReady();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.role === "admin";
  const pathname = usePathname();
  useDocumentTitle(isAdmin ? pageTitle(pathname, TITLES, "Teacher console") : "Teacher sign in · Hamza Teaches");

  useSessionTimeout(
    () => {
      logout();
      toast("Signed out after 30 minutes of inactivity.", "info");
      router.replace("/login");
    },
    IDLE_MS,
    isAdmin,
  );

  if (initializing) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }
  if (!isAdmin) return <AdminLogin />;
  if (!ready) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }

  return (
    <AdminFilterProvider>
      <div className="relative isolate flex min-h-dvh">
        <PortalAmbient />
        {/* Persistent sidebar — tablet narrower, desktop full */}
        <aside className="hidden w-60 shrink-0 border-r border-white/[0.06] md:block lg:w-64">
          <div className="sticky top-0 h-dvh">
            <Sidebar />
          </div>
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[82%] animate-slide-in border-r border-border shadow-[var(--shadow-lg)]">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/[0.06] bg-paper/95 px-4 lg:bg-paper/70 lg:backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 md:hidden"
                aria-label="Open navigation"
              >
                <Icon.Menu />
              </button>
              <div className="md:hidden"><LogoTight className="h-5" /></div>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
            </div>
          </header>

          <main className="flex-1"><ScheduleGate>{children}</ScheduleGate></main>
        </div>
      </div>
    </AdminFilterProvider>
  );
}
