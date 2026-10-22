"use client";

import { createPortal } from "react-dom";
import { Avatar } from "@/components/student/Avatar";
import { levelFor } from "@/lib/focus";
import { Welcome } from "@/components/student/Welcome";
import { NotifyNudge } from "@/components/student/NotifyNudge";
import { ScheduleGate } from "@/components/ScheduleGate";
import { waTextLink } from "@/lib/landing";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useDataReady } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { LogoTight } from "@/components/Brand";
import { NotificationBell } from "@/components/NotificationBell";
import { CohortTag } from "@/components/ui";
import { NavIcon } from "@/components/nav/NavIcons";
import type { Cohort } from "@/types";
import { cohortById } from "@/lib/data/selectors";
import { cn } from "@/lib/cn";
import { displayName } from "@/lib/display-name";
import { PortalAmbient } from "@/components/PortalAmbient";
import { pageTitle, useDocumentTitle } from "@/hooks/usePageTitle";

const TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/plan": "My plan",
  "/progress": "Progress",
  "/assignments": "Assignments",
  "/tests": "Tests",
  "/groundwork": "Groundwork",
  "/classes": "Classes",
  "/notes": "Notes",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/results": "Result",
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, initializing, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const db = useDatabase();
  const ready = useDataReady();

  useEffect(() => {
    if (!initializing && (!session || session.role !== "student")) router.replace("/login");
  }, [session, initializing, router]);
  // Tab title per page; the test runner sets its own (the countdown).
  useDocumentTitle(/^\/test\/[^/]+$/.test(pathname) ? null : pageTitle(pathname, TITLES, "Hamza Teaches"));

  if (initializing || !ready || !session || session.role !== "student" || !session.studentId) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }

  const student = studentById(db, session.studentId);
  if (!student) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-ink-2">Your session has ended. Please sign in again.</p>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          className="inline-flex h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-on-brand"
        >
          Sign in
        </button>
      </div>
    );
  }
  const cohort = cohortById(db, student.cohortId);

  // A switched-off cohort is already locked out at the database (it resolves
  // these students to nobody); this is the courtesy message rather than an
  // empty-looking portal.
  if (cohort && !cohort.active) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-xl font-bold text-ink">This class has finished</p>
        <p className="max-w-sm text-sm text-ink-2">
          Your class has finished for now. If you think this is a mistake, message Hamza.
        </p>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          className="text-sm font-semibold text-brand hover:underline"
        >
          Sign out
        </button>
      </div>
    );
  }

  // The test runner is distraction-free — it hides the global nav itself.
  const inRunner = /^\/test\/[^/]+$/.test(pathname);

  const links = [
    // `short` is the phone dock label, where six items share 375px.
    { href: "/dashboard", label: "Home", short: "Home", Icon: NavIcon.Home },
    { href: "/classes", label: "Classes", short: "Classes", Icon: NavIcon.Classes },
    { href: "/tests", label: "Tests", short: "Tests", Icon: NavIcon.Tests },
    { href: "/groundwork", label: "Groundwork", short: "Groundwork", Icon: NavIcon.Groundwork, feature: true },
    { href: "/assignments", label: "Assignments", short: "Tasks", Icon: NavIcon.Tasks },
    { href: "/notes", label: "Notes", short: "Notes", Icon: NavIcon.Notes },
    { href: "/progress", label: "Progress", short: "Progress", Icon: NavIcon.Progress },
  ];
  // Results belong to Tests; the full plan opens from Home.
  const isActive = (href: string) =>
    pathname === href || (href === "/tests" && pathname.startsWith("/results")) || (href === "/dashboard" && pathname === "/plan");
  const name = displayName(student.username);
  const signOut = () => { logout(); router.replace("/login"); };

  return (
    <div className="relative isolate min-h-dvh">
      <PortalAmbient />
      {!inRunner && (
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-paper/60 backdrop-blur-xl">
          <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/dashboard" className="flex shrink-0 items-center" aria-label="Home">
              <LogoTight className="h-[18px] sm:h-5" />
            </Link>

            {/* Desktop: a floating dock in the middle. */}
            <nav aria-label="Primary" className="hidden md:block">
              <ul className="flex items-center gap-0.5 rounded-full border border-white/[0.07] bg-surface/50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_-12px_rgba(0,0,0,0.6)]">
                {links.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-all duration-300",
                          active
                            ? "bg-[linear-gradient(180deg,rgba(251,193,89,0.18),rgba(251,193,89,0.08))] text-brand shadow-[inset_0_0_0_1px_rgba(251,193,89,0.25)]"
                            : "text-ink-3 hover:bg-white/[0.04] hover:text-ink",
                        )}
                      >
                        <l.Icon active={active} className="h-[18px] w-[18px]" />
                        <span className={cn(!active && "hidden lg:inline")}>{l.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="flex shrink-0 items-center gap-1.5">
              <NotificationBell />
              <AccountMenu name={name} cohort={cohort} avatar={profile.avatar} frame={levelFor(profile.focus?.totalMinutes ?? 0).frame} onSignOut={signOut} />
            </div>
          </div>
        </header>
      )}
      <ScheduleGate>{children}</ScheduleGate>
      {!inRunner && !profile.onboarded && createPortal(<Welcome db={db} student={student} />, document.body)}
      {!inRunner && <NotifyNudge />}

      {/* Phones: a floating dock at the thumb. */}
      {!inRunner && (
        <nav
          aria-label="Primary"
          data-tabbar
          className="fixed inset-x-3 bottom-3 z-30 md:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-7 rounded-[22px] border border-white/[0.08] bg-[#1d2023]/85 p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            {links.map((l) => {
              const active = isActive(l.href);
              // Groundwork sits in the middle as a raised gold button (no room for its full name).
              if ("feature" in l && l.feature)
                return (
                  <li key={l.href} className="flex items-center justify-center">
                    <Link
                      href={l.href}
                      aria-label={l.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "-mt-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_10px_24px_-8px_rgba(251,193,89,0.6)] ring-4 ring-paper transition-transform active:scale-95",
                        active && "ring-brand/30",
                      )}
                    >
                      <l.Icon active className="h-[22px] w-[22px] [&_g]:fill-current [&_g]:stroke-current" />
                    </Link>
                  </li>
                );
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold tracking-wide transition-colors duration-300",
                      active ? "bg-brand/[0.12] text-brand" : "text-ink-3",
                    )}
                  >
                    <l.Icon active={active} className="h-[20px] w-[20px]" />
                    {l.short}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** Initials button: opens the student's name, class and sign out. */
function AccountMenu({
  name,
  cohort,
  avatar,
  frame,
  onSignOut,
}: {
  name: string;
  cohort: { name: string; color: Cohort["color"] } | null;
  avatar?: string;
  frame?: string | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[13px] tracking-wide transition-transform hover:scale-105"
      >
        <Avatar id={avatar} initials={initials} frame={frame} className="h-10 w-10" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-60 animate-fade-up rounded-2xl border border-white/[0.08] bg-[#1d2023]/95 p-2 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className="px-3 pb-3 pt-2">
            <p className="text-[15px] font-bold text-ink">{name}</p>
            {cohort && <CohortTag color={cohort.color} name={cohort.name} className="mt-1 text-xs" />}
          </div>
          <div className="h-px bg-white/[0.06]" />
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-1 flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-white/[0.05] hover:text-ink"
          >
            <NavIcon.Settings className="h-[18px] w-[18px]" />
            Settings
          </Link>
          <a
            role="menuitem"
            href={waTextLink(`Hi Hamza, it's ${name}. `)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-white/[0.05] hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" />
            </svg>
            Message Hamza
          </a>
          <button
            role="menuitem"
            onClick={onSignOut}
            className="mt-1 flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-white/[0.05] hover:text-ink"
          >
            <NavIcon.Logout className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
