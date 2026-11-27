"use client";

import { ScheduleGate } from "@/components/ScheduleGate";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDataReady, useDatabase } from "@/lib/data/store";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useToast } from "@/components/toast";
import { AdminFilterProvider, useAdminFilter } from "@/lib/admin-filter";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { GROUPS, Sidebar } from "@/components/admin/Sidebar";
import { CohortDot, Icon } from "@/components/ui";
import { LogoTight } from "@/components/Brand";
import { Splash } from "@/components/Splash";
import { PortalSkeleton } from "@/components/PortalSkeleton";
import Link from "next/link";
import { NavIcon } from "@/components/nav/NavIcons";
import { cn } from "@/lib/cn";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { SaveStatus } from "@/components/admin/SaveStatus";
import { isTa, taHome, taMayOpen } from "@/lib/staff";
import { PortalAmbient } from "@/components/PortalAmbient";
import { PortalManifest } from "@/components/PortalManifest";
import { pageTitle, useDocumentTitle } from "@/hooks/usePageTitle";

// Long enough to teach a block of back-to-back classes in Meet without being signed out.
const IDLE_MS = 3 * 60 * 60 * 1000;
// Staff: a console left open on a shared laptop closes much sooner.
const STAFF_IDLE_MS = 30 * 60 * 1000;

const TITLES: Record<string, string> = {
  "/admin/today": "Today",
  "/admin/classes": "Classes",
  "/admin/recordings": "Recordings",
  "/admin/whiteboard": "Whiteboard",
  "/admin/tests": "Tests",
  "/admin/submissions": "Marking",
  "/admin/grading": "Marking",
  "/admin/assignments": "Homework",
  "/admin/bank": "Question bank",
  "/admin/notes": "Notes",
  "/admin/announcements": "Announcements",
  "/admin/roster": "Roster",
  "/admin/leads": "Waitlist",
  "/admin/cohorts": "Cohorts",
  "/admin/attendance": "Attendance",
  "/admin/activity": "Activity",
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
  const drawerRef = useRef<HTMLDivElement>(null);

  const isAdmin = session?.role === "admin";
  const pathname = usePathname();
  const ta = isTa(session);
  useEffect(() => {
    if (!ta || taMayOpen(pathname, session)) return;
    // Landing on the console's front door is normal; any other page that is off gets a word of why.
    if (pathname !== "/admin" && pathname !== "/admin/today") toast("Hamza hasn't switched this part on for you.", "info");
    router.replace(taHome(session));
  }, [ta, pathname, router, session, toast]);
  // The staff mark sits on the page itself, so owner-only things are also
  // hidden inside pop up windows and menus, which are drawn outside this layout.
  useLayoutEffect(() => {
    if (!ta) return;
    document.documentElement.setAttribute("data-ta", "");
    return () => document.documentElement.removeAttribute("data-ta");
  }, [ta]);
  useDocumentTitle(isAdmin ? pageTitle(pathname, TITLES, "Teacher console") : "Console sign in · Hamza Teaches");

  useSessionTimeout(
    () => {
      setMobileOpen(false);
      logout();
      toast(ta ? "Signed out after 30 minutes without use." : "Signed out after 3 hours without use.", "info");
      // Stay on the teacher sign-in, not the student one.
      router.replace("/admin");
    },
    ta ? STAFF_IDLE_MS : IDLE_MS,
    isAdmin,
  );

  // Only while the console itself is showing: signed out with the menu open,
  // the sign-in screen behind must still scroll.
  const drawerOpen = mobileOpen && isAdmin && ready;

  // Phone menu: focus moves into it and stays there, Esc closes it, the page
  // behind doesn't scroll, and focus goes back to the button that opened it.
  useEffect(() => {
    if (!drawerOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setMobileOpen(false);
      const panel = drawerRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    // Turning the phone sideways (or widening the window) brings the fixed
    // sidebar back; an open drawer would be hidden but still lock the page.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setMobileOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    drawerRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [drawerOpen]);

  // Phone tab bar. Hamza: the four everyday jobs. Staff: their own pages (up to four), spread evenly; More opens the rest and sign out.
  const tabs: Array<{ href: string; label: string; I: (p: { active?: boolean; className?: string }) => React.ReactNode }> = ta
    ? GROUPS.flatMap((g) => g.items)
        .filter((i) => taMayOpen(i.href, session))
        .slice(0, 4)
        .map((i) => ({ href: i.href, label: i.href === "/admin/whiteboard" ? "Board" : i.label, I: i.Icon }))
    : [
        { href: "/admin/today", label: "Today", I: NavIcon.Today },
        { href: "/admin/classes", label: "Classes", I: NavIcon.Classes },
        { href: "/admin/whiteboard", label: "Board", I: NavIcon.Board },
        { href: "/admin/submissions", label: "Marking", I: NavIcon.Inbox },
      ];

  if (initializing) {
    return <PortalSkeleton side="admin" />;
  }
  if (!isAdmin) return <AdminLogin />;
  // The assistant only ever lands on her own pages; anything else sends her to her marking list.
  if (ta && !taMayOpen(pathname, session)) return <Splash />;
  if (!ready) {
    return <PortalSkeleton side="admin" />;
  }

  return (
    <AdminFilterProvider>
      <div className="relative isolate flex min-h-dvh" data-ta={ta ? "" : undefined}>
        {/* Keyboard users can jump past the sidebar straight to the page. */}
        <a
          href="#admin-main"
          className="fixed left-3 top-3 z-[60] inline-flex h-11 -translate-y-24 items-center rounded-full border border-border-strong bg-surface-2 px-4 text-sm font-semibold text-ink opacity-0 focus:translate-y-0 focus:opacity-100 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand"
        >
          Skip to content
        </a>
        <PortalAmbient />
        <PortalManifest on />
        {/* Persistent sidebar — tablet narrower, desktop full */}
        <aside className="hidden w-56 shrink-0 border-r border-hairline md:block xl:w-64">
          <div className="sticky top-0 h-dvh">
            <Sidebar />
          </div>
        </aside>

        {/* Mobile overlay sidebar */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => setMobileOpen(false)} aria-hidden />
            <div
              ref={drawerRef}
              tabIndex={-1}
              className="absolute inset-y-0 left-0 w-72 max-w-[82%] animate-drawer-in border-r border-border shadow-[var(--shadow-lg)] outline-none"
            >
              <Sidebar onNavigate={() => setMobileOpen(false)} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="absolute right-2 top-3.5 flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Icon.Close />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-hairline bg-paper/95 px-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 md:hidden"
                aria-label="Open menu"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
              >
                <Icon.Menu />
              </button>
              <div className="md:hidden"><LogoTight className="h-5" /></div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <CohortPill />
              <SaveStatus />
              <CommandPalette />
              <NotificationBell />
            </div>
          </header>

          <main id="admin-main" tabIndex={-1} className="flex-1 pb-28 outline-none md:pb-0"><ScheduleGate fresh>{children}</ScheduleGate></main>
        </div>

        {/* Phones: the four everyday jobs at the thumb; everything else under More. */}
        {!/^\/admin\/whiteboard/.test(pathname) && (
          <nav aria-label="Quick" className="fixed inset-x-3 bottom-3 z-40 md:hidden" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
            <ul className="surface grid rounded-card p-1.5" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
              {tabs.map(({ href, label, I }) => {
                // Marking a paper is still the Marking tab.
                const on = pathname.startsWith(href) || (href === "/admin/submissions" && pathname.startsWith("/admin/grading"));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn("flex h-[52px] flex-col items-center justify-center gap-1 rounded-tile text-xs font-semibold transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98]", on ? "bg-white/[0.07] text-ink" : "text-ink-3")}
                    >
                      <I active={on} className="h-5 w-5" />
                      {/* A long page name (Announcements) is cut short rather than pushing its neighbours. */}
                      <span className="max-w-full truncate px-0.5">{label}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={drawerOpen}
                  className="flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-tile text-xs font-semibold text-ink-3 transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
                >
                  {/* Drawn on the menu icons' own grid and stroke, so it sits as light as its neighbours. */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden className="h-5 w-5 shrink-0">
                    <path d="M5.5 7h13M5.5 12h13M5.5 17h13" />
                  </svg>
                  More
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </AdminFilterProvider>
  );
}

/**
 * While one cohort is chosen under Viewing, every page says so here, with a
 * cross to clear it: a list narrowed without saying so reads as students missing.
 */
function CohortPill() {
  const db = useDatabase();
  const { cohortId, setCohortId } = useAdminFilter();
  const c = cohortId ? db.cohorts.find((x) => x.id === cohortId && x.active) : null;
  // A remembered cohort since switched off or removed: back to all, never a silently empty list.
  useEffect(() => {
    if (cohortId && !c) setCohortId(null);
  }, [cohortId, c, setCohortId]);
  if (!c) return null;
  return (
    <span className="inline-flex h-9 min-w-0 max-w-[11rem] items-center gap-1.5 rounded-full border border-hairline pl-3 text-sm font-semibold text-ink-2">
      <CohortDot color={c.color} />
      <span className="truncate">{c.name}</span>
      <button
        type="button"
        onClick={() => setCohortId(null)}
        aria-label={`Show all cohorts, not only ${c.name}`}
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink"
      >
        <Icon.Close className="h-4 w-4" />
      </button>
    </span>
  );
}
