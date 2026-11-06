"use client";

import { createPortal } from "react-dom";
import { Avatar } from "@/components/student/Avatar";
import { levelFor } from "@/lib/focus";
import { Welcome } from "@/components/student/Welcome";
import { NotifyNudge } from "@/components/student/NotifyNudge";
import { ScheduleGate } from "@/components/ScheduleGate";
import { useNow } from "@/hooks/useNow";
import { pkDate, slotsForStudent, useSchedule } from "@/lib/classes";
import { waTextLink } from "@/lib/landing";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useDataReady } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { dueFor } from "@/lib/due";
import { LogoTight } from "@/components/Brand";
import { Splash } from "@/components/Splash";
import { NotificationBell } from "@/components/NotificationBell";
import { CohortTag } from "@/components/ui";
import { NavIcon } from "@/components/nav/NavIcons";
import type { Cohort } from "@/types";
import { cohortById } from "@/lib/data/selectors";
import { cn } from "@/lib/cn";
import { displayName } from "@/lib/display-name";
import { PortalAmbient } from "@/components/PortalAmbient";
import { pageTitle, useDocumentTitle } from "@/hooks/usePageTitle";
import { useRecoverFocus } from "@/components/student/focus-session";

const TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/plan": "My plan",
  "/progress": "Progress",
  "/assignments": "Homework",
  "/tests": "Tests",
  "/groundwork": "Groundwork",
  "/classes": "Classes",
  "/notes": "Notes",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/results": "Result",
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { session, logout, initializing, profile, loadFailed, retryLoad } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const db = useDatabase();
  const ready = useDataReady();
  const nowMs = useNow();

  // Signed in but the portal didn't load (weak signal) is not signed out:
  // stay here and offer Try again rather than sending them to /login.
  useEffect(() => {
    if (!initializing && !loadFailed && (!session || session.role !== "student")) router.replace("/login");
  }, [session, initializing, loadFailed, router]);
  // Tab title per page; the test runner sets its own (the countdown).
  useDocumentTitle(/^\/test\/[^/]+$/.test(pathname) ? null : pageTitle(pathname, TITLES, "Hamza Teaches"));
  // Groundwork minutes from a session that was cut off (closed app, flat
  // battery) are added once that session is clearly over.
  useRecoverFocus(!initializing && session?.role === "student" && !!session.studentId);

  if (loadFailed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-semibold text-ink">Couldn&apos;t load your portal.</p>
        <p className="text-sm text-ink-2">Check your internet.</p>
        <button
          onClick={retryLoad}
          className="mt-2 inline-flex h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-on-brand active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    );
  }
  if (initializing || !session || session.role !== "student") {
    return <Splash />;
  }
  // Signed in, but no student record behind the account yet: waiting would
  // never end, so say so.
  if (!session.studentId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-semibold text-ink">Your account isn&apos;t set up yet.</p>
        <p className="text-sm text-ink-2">
          <a
            href={waTextLink("Hi Hamza, I signed in to the portal but my account isn't set up yet.")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand hover:underline"
          >
            Message Hamza
          </a>{" "}
          and I&apos;ll sort it out.
        </p>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          className="mt-2 inline-flex h-11 items-center rounded-full border border-border-strong px-6 text-sm font-semibold text-ink active:scale-[0.98]"
        >
          Sign out
        </button>
      </div>
    );
  }
  if (!ready) {
    return <Splash />;
  }

  const student = studentById(db, session.studentId);
  if (!student) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-semibold text-ink">Your portal didn&apos;t load.</p>
        <p className="max-w-xs text-sm text-ink-2">Usually a weak signal. Check your internet and try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-on-brand active:scale-[0.98]"
        >
          Try again
        </button>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          className="inline-flex h-11 items-center px-4 text-sm font-medium text-ink-3 hover:text-ink"
        >
          Sign out
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
    // Desktop shows them all; phones use phoneLinks (five tabs) below.
    { href: "/dashboard", label: "Home", short: "Home", Icon: NavIcon.Home },
    { href: "/classes", label: "Classes", short: "Classes", Icon: NavIcon.Classes },
    { href: "/tests", label: "Tests", short: "Tests", Icon: NavIcon.Tests },
    { href: "/groundwork", label: "Groundwork", short: "Groundwork", Icon: NavIcon.Groundwork, feature: true },
    { href: "/assignments", label: "Homework", short: "Homework", Icon: NavIcon.Tasks },
    { href: "/notes", label: "Notes", short: "Notes", Icon: NavIcon.Notes },
    { href: "/progress", label: "Progress", short: "Progress", Icon: NavIcon.Progress },
  ];
  // Phones: five tabs. "Work" holds Tests, Homework and Notes behind a switch.
  const WORK = ["/tests", "/assignments", "/notes"];
  const isWork = WORK.includes(pathname) || pathname.startsWith("/results") || /^\/test\/[^/]+\/submitted$/.test(pathname);
  // Work opens where something is waiting: open tests first, else homework.
  const due = dueFor(db, student, nowMs);
  const testsDue = due.openTests.length;
  const homeworkDue = due.overdue.length + due.dueSoon.filter((a) => +new Date(a.dueAt) - nowMs < 3 * 86_400_000).length;
  const workHref = testsDue ? "/tests" : homeworkDue ? "/assignments" : "/tests";
  const counts: Record<string, number> = { "/tests": testsDue, "/assignments": homeworkDue };
  const phoneLinks = [
    links[0],
    links[1],
    links[3],
    { href: workHref, label: "Work", short: "Work", Icon: NavIcon.Tests, work: true, badge: testsDue + homeworkDue },
    links[6],
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
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-paper/95 md:bg-paper/60 md:backdrop-blur-xl">
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
              <AccountMenu name={name} cohort={cohort} avatar={profile.avatar} level={levelFor(profile.focus?.totalMinutes ?? 0).index} onSignOut={signOut} />
            </div>
          </div>
        </header>
      )}
      {!inRunner && isWork && (
        <nav aria-label="Work" className="mx-auto max-w-3xl px-4 pt-5 sm:px-6 md:hidden">
          <ul className="grid grid-cols-3 gap-1 rounded-full border border-border bg-surface p-1">
            {[
              ["/tests", "Tests"],
              ["/assignments", "Homework"],
              ["/notes", "Notes"],
            ].map(([href, label]) => {
              const on = pathname === href || (href === "/tests" && pathname.startsWith("/results"));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors", on ? "bg-brand text-on-brand" : "text-ink-2")}
                  >
                    {label}
                    {!!counts[href] && (
                      <span className={cn("min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5 tabular-nums", on ? "bg-on-brand/15" : "bg-brand/15 text-brand")}>
                        {counts[href]}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <ScheduleGate>{children}</ScheduleGate>
      {!inRunner && !profile.onboarded && <WelcomeWhenFree db={db} student={student} />}
      {!inRunner && <NotifyNudge />}

      {/* Phones: a floating dock at the thumb. */}
      {!inRunner && (
        <nav
          aria-label="Primary"
          data-tabbar
          className="fixed inset-x-3 bottom-3 z-30 md:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-5 rounded-[22px] border border-white/[0.08] bg-[#1d2023]/[0.97] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)]">
            {phoneLinks.map((l) => {
              const active = "work" in l ? isWork : isActive(l.href);
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
                      "flex h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold tracking-wide transition-colors duration-300 active:scale-95",
                      active ? "bg-brand/[0.12] text-brand" : "text-ink-3",
                    )}
                  >
                    <span className="relative">
                      <l.Icon active={active} className="h-[20px] w-[20px]" />
                      {"badge" in l && !!l.badge && (
                        <span aria-label={`${l.badge} to do`} className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[11px] font-bold leading-[18px] text-on-brand tabular-nums ring-2 ring-[#1d2023]">
                          {l.badge}
                        </span>
                      )}
                    </span>
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
  level,
  onSignOut,
}: {
  name: string;
  cohort: { name: string; color: Cohort["color"] } | null;
  avatar?: string;
  level?: number;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // pointerdown, not mousedown: iPhone may not send a mouse event for a tap
    // on a blank area, which left the menu stuck open.
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] tracking-wide transition-transform hover:scale-105"
      >
        <Avatar id={avatar} initials={initials} level={level} still className="h-10 w-10" />
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

/**
 * The first-run welcome, but never over a class: from 10 minutes before a
 * class until it ends, the Join button stays in reach and the welcome waits.
 */
function WelcomeWhenFree({ db, student }: { db: Parameters<typeof Welcome>[0]["db"]; student: NonNullable<ReturnType<typeof studentById>> }) {
  const nowMs = useNow();
  useSchedule(); // re-check when the timetable arrives
  const busy = slotsForStudent(db, student, pkDate(nowMs)).some((s) => nowMs >= s.startMs - 10 * 60_000 && nowMs < s.endMs);
  return busy ? null : createPortal(<Welcome db={db} student={student} />, document.body);
}
