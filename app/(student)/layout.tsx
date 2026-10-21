"use client";

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

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, initializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const db = useDatabase();
  const ready = useDataReady();

  useEffect(() => {
    if (!initializing && (!session || session.role !== "student")) router.replace("/login");
  }, [session, initializing, router]);

  if (initializing || !ready || !session || session.role !== "student" || !session.studentId) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }

  const student = studentById(db, session.studentId);
  if (!student) {
    return <div className="flex min-h-dvh items-center justify-center text-ink-3">Session expired…</div>;
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
    { href: "/plan", label: "Plan", short: "Plan", Icon: NavIcon.Plan },
    { href: "/progress", label: "Progress", short: "Progress", Icon: NavIcon.Progress },
    { href: "/assignments", label: "Assignments", short: "Tasks", Icon: NavIcon.Tasks },
    { href: "/notes", label: "Notes", short: "Notes", Icon: NavIcon.Notes },
    { href: "/settings", label: "Settings", short: "Settings", Icon: NavIcon.Settings },
  ];
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
                  const active = pathname === l.href;
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
              <AccountMenu name={name} cohort={cohort} onSignOut={signOut} />
            </div>
          </div>
        </header>
      )}
      {children}

      {/* Phones: a floating dock at the thumb. */}
      {!inRunner && (
        <nav
          aria-label="Primary"
          data-tabbar
          className="fixed inset-x-3 bottom-3 z-30 md:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-6 rounded-[22px] border border-white/[0.08] bg-[#1d2023]/85 p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            {links.map((l) => {
              const active = pathname === l.href;
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
  onSignOut,
}: {
  name: string;
  cohort: { name: string; color: Cohort["color"] } | null;
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
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(145deg,#2c3034,#1c1f22)] text-[13px] font-bold tracking-wide text-brand shadow-[inset_0_0_0_1px_rgba(251,193,89,0.35)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(251,193,89,0.7)]"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-60 animate-fade-up rounded-2xl border border-white/[0.08] bg-[#1d2023]/95 p-2 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className="px-3 pb-3 pt-2">
            <p className="text-[15px] font-bold text-ink">{name}</p>
            {cohort && <CohortTag color={cohort.color} name={cohort.name} className="mt-1 text-xs" />}
          </div>
          <div className="h-px bg-white/[0.06]" />
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
