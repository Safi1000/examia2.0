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
import { PortalSkeleton } from "@/components/PortalSkeleton";
import { useAccessPaused } from "@/lib/access-paused";
import { NotificationBell } from "@/components/NotificationBell";
import { Button, CohortTag } from "@/components/ui";
import { NavIcon } from "@/components/nav/NavIcons";
import type { Cohort } from "@/types";
import { cohortById } from "@/lib/data/selectors";
import { cn } from "@/lib/cn";
import { displayName } from "@/lib/display-name";
import { PortalAmbient } from "@/components/PortalAmbient";
import { PortalManifest } from "@/components/PortalManifest";
import { pageTitle, useDocumentTitle } from "@/hooks/usePageTitle";
import { useRecoverFocus } from "@/components/student/focus-session";
import { useBackClosesMenu } from "@/components/student/useBackToClose";
import { setActivityPath, startActivity } from "@/lib/activity-tracker";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { EmptyArt } from "@/components/student/PortalKit";

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
  // The header is see-through until the page scrolls (on Groundwork, until
  // past its photo), then turns to the plain page colour with a hairline (no glass).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > (pathname === "/groundwork" ? window.innerHeight - 160 : 12));
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [pathname]);

  // Signed in but the portal didn't load (weak signal) is not signed out:
  // stay here and offer Try again rather than sending them to /login.
  useEffect(() => {
    if (!initializing && !loadFailed && (!session || session.role !== "student")) router.replace("/login");
  }, [session, initializing, loadFailed, router]);
  // Tab title per page; the test runner sets its own (the countdown).
  useDocumentTitle(
    /^\/test\/[^/]+$/.test(pathname) ? null : /^\/test\/[^/]+\/submitted$/.test(pathname) ? "Handed in · Hamza Teaches" : pageTitle(pathname, TITLES, "Hamza Teaches"),
  );
  // Groundwork minutes from a session that was cut off (closed app, flat
  // battery) are added once that session is clearly over.
  useRecoverFocus(!initializing && session?.role === "student" && !!session.studentId);
  // Active time in the portal, for Hamza's Activity page (students never see it).
  const tracking = !DEMO && !initializing && session?.role === "student" && !!session.studentId;
  useEffect(() => {
    if (!tracking) return;
    return startActivity(async () => (await supabase().auth.getSession()).data.session?.access_token ?? null);
  }, [tracking]);
  useEffect(() => setActivityPath(pathname), [pathname]);
  // Hamza can pause a student's access from Students: they sign in as usual
  // and see only a blank screen until it is resumed.
  const accessPaused = useAccessPaused(tracking);

  if (loadFailed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <EmptyArt name="empty-offline" className="mb-2" />
        <p className="text-base font-semibold text-ink">Couldn&apos;t load your portal.</p>
        <p className="text-sm text-ink-2">Check your internet.</p>
        <Button size="lg" onClick={retryLoad} className="mt-2">
          Try again
        </Button>
      </div>
    );
  }
  // Checking the sign-in: the page's outline already, so it never jumps from a splash to a page.
  if (initializing) return <PortalSkeleton />;
  if (!session || session.role !== "student") {
    return <Splash tips />;
  }
  if (accessPaused) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-label="Hamza Teaches">
        <LogoTight className="h-6 opacity-25" />
      </div>
    );
  }
  // Signed in, but no student record behind the account yet: waiting would
  // never end, so say so.
  if (!session.studentId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-base font-semibold text-ink">Your account isn&apos;t set up yet.</p>
        <p className="text-sm text-ink-2">
          <a
            href={waTextLink("Hi Hamza, I signed in to the portal but my account isn't set up yet.")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand hover:underline"
          >
            Message me
          </a>{" "}
          and I&apos;ll sort it out.
        </p>
        <Button variant="secondary" onClick={() => { logout(); router.replace("/login"); }} className="mt-2">
          Sign out
        </Button>
      </div>
    );
  }
  if (!ready) {
    return <PortalSkeleton />;
  }

  const student = studentById(db, session.studentId);
  if (!student) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <EmptyArt name="empty-offline" className="mb-2" />
        <p className="text-base font-semibold text-ink">Your portal didn&apos;t load.</p>
        <p className="max-w-xs text-sm text-ink-2">Usually a weak signal. Check your internet and try again.</p>
        <Button size="lg" onClick={() => window.location.reload()} className="mt-2">
          Try again
        </Button>
        <Button variant="ghost" onClick={() => { logout(); router.replace("/login"); }}>
          Sign out
        </Button>
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
        <p className="text-xl font-bold text-ink">This class has finished</p>
        <p className="max-w-sm text-base text-ink-2">
          Your class has finished for now. If you think this is a mistake, message me.
        </p>
        <Button variant="secondary" onClick={() => { logout(); router.replace("/login"); }} className="mt-2">
          Sign out
        </Button>
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
  // Phones: five plain tabs, each page one tap away (Hamza, Nov 2026: students could not find things
  // behind the old "Work" tab). Progress and Groundwork open from Home and from the account menu.
  const due = dueFor(db, student, nowMs);
  const testsDue = due.openTests.length;
  const homeworkDue = due.overdue.length + due.dueSoon.filter((a) => +new Date(a.dueAt) - nowMs < 3 * 86_400_000).length;
  const phoneLinks = [links[0], links[1], { ...links[2], badge: testsDue }, { ...links[4], badge: homeworkDue }, links[5]];
  // On a phone, pages with no tab of their own light up Home (they open from it).
  const fromHome = ["/plan", "/progress", "/groundwork", "/settings", "/notifications"];
  // Results and the Done screen after a test belong to Tests; the full plan opens from Home.
  const inTests = pathname.startsWith("/results") || /^\/test\/[^/]+\/submitted$/.test(pathname);
  const isActive = (href: string) =>
    pathname === href || (href === "/tests" && inTests) || (href === "/dashboard" && pathname === "/plan");
  const name = displayName(student.username);
  // Every page sits on warm charcoal with a faint grid (PortalAmbient);
  // Groundwork lays its full photo on top.
  const signOut = () => { logout(); router.replace("/login"); };

  return (
    <div className="relative isolate min-h-dvh">
      {!inRunner && (
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:inline-flex focus:h-11 focus:items-center focus:rounded-full focus:bg-surface focus:px-5 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>
      )}
      <PortalAmbient />
      <PortalManifest on />
      {!inRunner && (
        // In the phone app, its own header and tab bar replace this bar and the dock below (web-only).
        <header
          className={cn(
            "web-only sticky top-0 z-30 border-b transition-[background-color,border-color] duration-200 ease-[var(--ease-out)]",
            scrolled ? "border-hairline bg-paper" : "border-transparent bg-transparent",
          )}
        >
          <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
            <Link href="/dashboard" className="flex min-h-11 shrink-0 items-center" aria-label="Home">
              <LogoTight className="h-[18px] sm:h-5" />
            </Link>

            {/* Desktop: a floating dock in the middle. */}
            <nav aria-label="Primary" className="hidden md:block">
              <ul className="flex items-center gap-0.5 rounded-full border border-hairline bg-surface/50 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {links.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        aria-label={l.label}
                        title={l.label}
                        className={cn(
                          // Tablets (768 to 1023px): the label sits under the icon, like the phone tabs, so every tab is named.
                          // Laptops: icon and label side by side.
                          "relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-xs font-semibold transition-colors duration-150 ease-[var(--ease-out)] lg:h-9 lg:flex-row lg:gap-2 lg:px-3.5 lg:text-sm lg:before:absolute lg:before:inset-x-0 lg:before:-inset-y-1 lg:before:content-['']",
                          active
                            ? "bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : "text-ink-3 hover:bg-white/[0.04] hover:text-ink",
                        )}
                      >
                        <l.Icon active={active} className="h-[18px] w-[18px]" />
                        <span className="leading-none lg:leading-normal">{l.label}</span>
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
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <ScheduleGate>{children}</ScheduleGate>
      </main>
      {!inRunner && !profile.onboarded && <WelcomeWhenFree db={db} student={student} />}
      {!inRunner && <NotifyNudge />}

      {/* Phones: a floating dock at the thumb. */}
      {!inRunner && (
        <nav
          aria-label="Primary"
          data-tabbar
          className="web-only fixed inset-x-3 bottom-3 z-40 md:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="surface grid grid-cols-5 rounded-card p-1.5">
            {phoneLinks.map((l) => {
              const active = isActive(l.href) || (l.href === "/dashboard" && fromHome.includes(pathname));
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-[52px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-95",
                      active ? "bg-white/[0.07] text-ink" : "text-ink-3",
                    )}
                  >
                    <span className="relative">
                      <l.Icon active={active} className="h-[20px] w-[20px]" />
                      {"badge" in l && !!l.badge && (
                        <span aria-hidden className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-xs font-bold leading-[18px] text-on-brand tabular-nums ring-2 ring-surface">
                          {l.badge}
                        </span>
                      )}
                    </span>
                    {l.short}
                    {"badge" in l && !!l.badge && <span className="sr-only">, {l.badge} to do</span>}
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
  // A mis-tap on Sign out only asks first: a student may not remember their password.
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (!open) return;
    // pointerdown, not mousedown: iPhone may not send a mouse event for a tap
    // on a blank area, which left the menu stuck open.
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    // Escape closes and hands focus back to the button, so the keyboard isn't left on a menu item that has gone.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  // The phone's Back closes the open menu first. A page picked from the menu takes its place in history.
  const leave = useBackClosesMenu(open, () => setOpen(false));
  const go = () => { leave(); setOpen(false); };

  return (
    <div
      ref={ref}
      className="relative"
      // Tabbing on past the last item closes the menu rather than leaving it open behind the page.
      onBlur={(e) => { if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
      <button
        ref={button}
        type="button"
        onClick={() => { setOpen((o) => !o); setConfirming(false); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
      >
        <Avatar id={avatar} initials={initials} level={level} still className="h-10 w-10" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[52px] w-64 animate-fade-up rounded-tile border border-hairline-strong bg-surface p-2 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.8)]">
          <div className="px-3 pb-3 pt-2">
            <p className="truncate text-base font-semibold text-ink">{name}</p>
            {cohort && <CohortTag color={cohort.color} name={cohort.name} className="mt-1 text-xs" />}
          </div>
          <div className="mb-1 h-px bg-hairline" />
          {/* Phones: the two pages with no tab of their own. */}
          <Link
            role="menuitem"
            href="/progress"
            replace
            onClick={go}
            className="flex h-11 w-full items-center gap-3 rounded-field px-3 text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-2 md:hidden"
          >
            <NavIcon.Progress className="h-5 w-5" />
            Progress
          </Link>
          <Link
            role="menuitem"
            href="/groundwork"
            replace
            onClick={go}
            className="flex h-11 w-full items-center gap-3 rounded-field px-3 text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-2 md:hidden"
          >
            <NavIcon.Groundwork className="h-5 w-5" />
            Groundwork
          </Link>
          <Link
            role="menuitem"
            href="/settings"
            replace
            onClick={go}
            className="flex h-11 w-full items-center gap-3 rounded-field px-3 text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-2"
          >
            <NavIcon.Settings className="h-5 w-5" />
            Settings
          </Link>
          <a
            role="menuitem"
            href={waTextLink(`Hi Hamza, it's ${name}. `)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex h-11 w-full items-center gap-3 rounded-field px-3 text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" />
            </svg>
            Message me
          </a>
          {confirming ? (
            <div className="rounded-field bg-surface-2 px-3 pb-3 pt-2.5" role="group" aria-label="Sign out of the portal?">
              <p className="text-base font-semibold text-ink">Sign out of the portal?</p>
              <div className="mt-2.5 flex gap-2">
                <Button variant="secondary" size="sm" role="menuitem" onClick={() => { leave(); onSignOut(); }} className="flex-1">
                  Sign out
                </Button>
                <Button ref={keep} variant="ghost" size="sm" role="menuitem" onClick={() => setConfirming(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming(true)}
              className="flex h-11 w-full items-center gap-3 rounded-field px-3 text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-2"
            >
              <NavIcon.Logout className="h-5 w-5" />
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The first-run welcome, but never over a class: from 10 minutes before a
 * class until it ends, the Join button stays in reach and the welcome waits.
 * Once it has started it stays, so a student part way through never loses their picks.
 */
function WelcomeWhenFree({ db, student }: { db: Parameters<typeof Welcome>[0]["db"]; student: NonNullable<ReturnType<typeof studentById>> }) {
  const nowMs = useNow();
  useSchedule(); // re-check when the timetable arrives
  const busy = slotsForStudent(db, student, pkDate(nowMs)).some((s) => nowMs >= s.startMs - 10 * 60_000 && nowMs < s.endMs);
  const [started, setStarted] = useState(false);
  if (!busy && !started) setStarted(true);
  return busy && !started ? null : createPortal(<Welcome db={db} student={student} />, document.body);
}
