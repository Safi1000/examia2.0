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
import { PausedScreen } from "@/components/student/PausedScreen";
import { FarewellScreen, postFarewell } from "@/components/student/FarewellScreen";
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
import { BackRow, EmptyArt } from "@/components/student/PortalKit";

const TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/plan": "My plan",
  "/progress": "Progress",
  "/assignments": "Homework",
  "/tests": "Tests",
  "/groundwork": "Focus",
  "/classes": "Classes",
  "/notes": "Notes",
  "/settings": "Settings",
  "/notifications": "Notifications",
  "/results": "Result",
  "/study": "Study",
  "/more": "More",
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
  // Hamza can pause a student's access from Students (with a reason, or not),
  // or mark them as left: they sign in as usual and see only the paused screen,
  // or the farewell screen, until Hamza resumes them or brings them back.
  const access = useAccessPaused(tracking);

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
  if (access.paused) {
    const leave = () => { logout(); router.replace("/login"); };
    if (access.left) {
      return (
        <FarewellScreen
          kind={access.left.kind}
          sent={access.farewellSent}
          onSignOut={leave}
          send={async (note) => {
            if (DEMO) return new Promise<boolean>((r) => setTimeout(() => r(true), 600));
            const bearer = (await supabase().auth.getSession()).data.session?.access_token;
            return bearer ? postFarewell(note, { bearer }) : false;
          }}
        />
      );
    }
    return <PausedScreen reason={access.reason} username={access.username || (session.studentId ? studentById(db, session.studentId)?.username ?? "" : "")} onSignOut={leave} />;
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

  const due = dueFor(db, student, nowMs);
  const testsDue = due.openTests.length;
  const homeworkDue = due.overdue.length + due.dueSoon.filter((a) => +new Date(a.dueAt) - nowMs < 3 * 86_400_000).length;
  // One bar for phones and laptops (Nov 2026): Home, Study, Focus, Notes, More. Classes, My plan, Progress,
  // Settings and Notifications open from Home and More, and light More; tests, homework and results light Study.
  const phoneLinks: PhoneTab[] = [
    { href: "/dashboard", label: "Home", Icon: NavIcon.Home, lights: (p) => p === "/dashboard" },
    {
      href: "/study",
      label: "Study",
      Icon: NavIcon.Tests,
      badge: testsDue + homeworkDue,
      lights: (p) => p === "/study" || p.startsWith("/tests") || p.startsWith("/assignments") || p.startsWith("/test/") || p.startsWith("/results"),
    },
    { href: "/groundwork", label: "Focus", Icon: NavIcon.Groundwork, centre: true, lights: (p) => p.startsWith("/groundwork") },
    { href: "/notes", label: "Notes", Icon: NavIcon.Notes, lights: (p) => p.startsWith("/notes") },
    { href: "/more", label: "More", Icon: NavIcon.More, lights: (p) => p === "/more" || p.startsWith("/progress") || p.startsWith("/settings") || p.startsWith("/notifications") || p.startsWith("/classes") || p === "/plan" },
  ];
  const name = displayName(student.username);
  // Phones in the browser: pages opened from More (or Study) get a way back. The app draws its own back.
  const back = /^\/(progress|settings|notifications|classes|plan)(\/|$)/.test(pathname)
    ? { href: "/more", label: "More" }
    : /^\/(results\/|tests$|assignments$)/.test(pathname)
      ? { href: "/study", label: "Study" }
      : null;
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
                {phoneLinks.map((l) => {
                  const active = l.lights(pathname);
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
        {back && !inRunner && (
          <div className="mx-auto max-w-3xl px-5 pt-1 sm:px-6">
            <BackRow href={back.href} label={back.label} />
          </div>
        )}
        <ScheduleGate>{children}</ScheduleGate>
      </main>
      {!inRunner && !profile.onboarded && <WelcomeWhenFree db={db} student={student} />}
      {!inRunner && <NotifyNudge />}

      {/* Phones: a floating dock at the thumb, the same shape as the phone app's bar. */}
      {!inRunner && <PhoneDock tabs={phoneLinks} pathname={pathname} />}
    </div>
  );
}

type PhoneTab = {
  href: string;
  label: string;
  Icon: (p: { active?: boolean; className?: string }) => React.ReactNode;
  badge?: number;
  /** The gold Focus button in the middle. */
  centre?: boolean;
  /** The pages that light this tab up. */
  lights: (pathname: string) => boolean;
};

/**
 * The phone dock (below md): a floating capsule with five even columns, an
 * off-white highlight on the current tab (never gold), and the gold Focus
 * button raised in the middle, like the phone app (mobile-1.2 components/portal.tsx Dock).
 */
function PhoneDock({ tabs, pathname }: { tabs: PhoneTab[]; pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      data-tabbar
      className="web-only fixed inset-x-3 bottom-3 z-40 md:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="relative grid h-16 grid-cols-5 rounded-full border border-white/[0.08] bg-surface/[0.92] p-1.5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        {tabs.map((t) => {
          const active = t.lights(pathname);
          if (t.centre) {
            return (
              <li key={t.href} className="relative flex justify-center">
                <Link
                  href={t.href}
                  aria-label="Focus timer"
                  aria-current={active ? "page" : undefined}
                  className="group absolute -top-[21px] flex h-16 w-16 items-center justify-center rounded-full bg-[#25282B] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  {/* The soft gold glow under the disc. */}
                  <span aria-hidden className="absolute h-[54px] w-[54px] rounded-full bg-brand/45 blur-[10px]" />
                  <span
                    aria-hidden
                    className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFDF94,#FBC159_55%,#F4B444)] text-on-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-transform duration-150 ease-[var(--ease-out)] group-active:scale-[0.92] motion-reduce:transition-none motion-reduce:group-active:scale-100"
                  >
                    <FocusGlyph className="h-[26px] w-[26px]" />
                  </span>
                </Link>
              </li>
            );
          }
          const badge = t.badge ? (t.badge > 9 ? "9+" : String(t.badge)) : null;
          return (
            <li key={t.href} className="min-w-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 rounded-full text-xs leading-none whitespace-nowrap outline-none transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink motion-reduce:transition-none motion-reduce:active:scale-100",
                  active ? "bg-white/[0.09] font-semibold text-ink" : "font-medium text-ink/55",
                )}
              >
                <span className="relative">
                  <t.Icon active={active} className="h-[22px] w-[22px]" />
                  {badge && (
                    <span aria-hidden className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-ink px-1 text-center text-[10px] font-bold leading-[18px] text-paper tabular-nums ring-2 ring-surface">
                      {badge}
                    </span>
                  )}
                </span>
                {t.label}
                {badge && <span className="sr-only">, {t.badge} to do</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The Focus button's glyph: a filled stopwatch in dark charcoal. */
function FocusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect x="9.5" y="2" width="5" height="2.2" rx="1.1" fill="currentColor" />
      <path d="M18.4 6.2l1.3-1.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="7.5" fill="currentColor" />
      <path d="M12 9.5v4.2l2.6 1.6" stroke="#FBC159" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
            Focus
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
