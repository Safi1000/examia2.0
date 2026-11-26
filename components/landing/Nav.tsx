"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOptionalAuth } from "@/lib/auth-core";
import { preloadPortal } from "@/components/providers";
import { COMPANY_NAME } from "@/lib/config";
import { Logo } from "@/components/Brand";
import { BookButton } from "./BookingModal";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** Everything free on the site, in one place. Shown from the Menu button (phones) and Free resources (laptops). */
const STUDY: Array<{ href: string; label: string; note: string }> = [
  { href: "/past-papers", label: "Past papers", note: "With mark schemes, up to 2026" },
  { href: "/past-papers/topics", label: "Questions by topic", note: "Past paper questions, sorted" },
  { href: "/grade-thresholds", label: "Grade thresholds", note: "Marks needed for each grade" },
  { href: "/past-papers/examiner-reports", label: "Examiner reports", note: "Where marks were lost, paper by paper" },
  { href: "/syllabus", label: "Syllabus checklists", note: "Every topic, with the official PDF" },
  { href: "/blog", label: "The Exam Room", note: "Topic guides and exam technique" },
  { href: "/tools", label: "Free tools", note: "Calculators and a grade predictor" },
];

function StudyMenu({ open, onClose, account }: { open: boolean; onClose: () => void; account: { href: string; label: string } }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="Close menu" onClick={onClose} className="fixed inset-0 z-20 cursor-default bg-black/40" />
      <nav
        id="study-menu"
        aria-label="Free resources"
        className="animate-fade-in absolute inset-x-0 top-2 z-30 mx-auto max-w-md overflow-hidden rounded-card border border-hairline-strong bg-band-c/95 shadow-[var(--shadow-lg)] backdrop-blur-xl sm:inset-x-auto sm:right-0 sm:mx-0 sm:w-[22rem]"
      >
        <form action="/search" role="search" className="border-b border-hairline p-3">
          <label className="relative block">
            <span className="sr-only">Search the site</span>
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m14 14 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              name="q"
              placeholder="Search a topic or a paper code"
              className={`min-h-12 w-full rounded-full border border-hairline-strong bg-white/[0.04] pl-11 pr-4 text-base text-ink placeholder:text-faint ${focusRing}`}
            />
          </label>
        </form>
        <ul className="divide-y divide-hairline">
          {STUDY.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={onClose}
                className={`flex min-h-14 items-center justify-between gap-4 px-5 py-3 transition-colors duration-150 hover:bg-white/[0.04] ${focusRing}`}
              >
                <span>
                  <span className="block text-base font-semibold text-ink">{l.label}</span>
                  <span className="block text-sm text-faint">{l.note}</span>
                </span>
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-faint">
                  <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3 text-base">
          <Link href="/online-classes" onClick={onClose} className={`inline-flex min-h-11 items-center font-semibold text-muted-foreground hover:text-ink ${focusRing}`}>
            Online classes
          </Link>
          <Link
            href={account.href}
            prefetch={false}
            onClick={onClose}
            onPointerEnter={preloadPortal}
            onTouchStart={preloadPortal}
            className={`inline-flex min-h-11 items-center font-semibold text-muted-foreground hover:text-ink sm:hidden ${focusRing}`}
          >
            {account.label}
          </Link>
        </div>
      </nav>
    </>
  );
}

/**
 * Login and the one main action: book the free trial (opens the calendar).
 * WhatsApp lives in the floating button, bottom right (MobileCta.tsx).
 *
 * `heroCta`: the page opens with its own gold hero button on screen (the homepage),
 * so the bar's button starts quiet in the first paint instead of flashing gold.
 */
export function Nav({ heroCta: startQuiet = false }: { heroCta?: boolean } = {}) {
  // Public pages render outside AuthProvider (so they reach the server HTML),
  // so there is no session here and the link reads "Login".
  const session = useOptionalAuth()?.session;
  const isStudent = session?.role === "student";

  const [menu, setMenu] = useState(false);
  const account = { href: isStudent ? "/dashboard" : "/login", label: isStudent ? "Dashboard" : "Login" };

  // The glass bar gains a soft shadow once the page moves under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // One gold button per view: while a page's own hero button is on screen, the bar's
  // button goes quiet (outlined) and turns gold again once the hero scrolls away.
  const [heroCta, setHeroCta] = useState(startQuiet);
  useEffect(() => {
    const el = document.querySelector("[data-hero-cta]");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHeroCta(e.isIntersecting), {
      rootMargin: "-80px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={`glass-bar mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-full pl-5 pr-2 sm:h-[72px] sm:pl-7 sm:pr-3 ${
          scrolled ? "glass-bar--scrolled" : ""
        }`}
      >
        <Link
          href="/"
          className={`flex min-h-11 shrink-0 items-center rounded-lg ${focusRing}`}
          aria-label={`${COMPANY_NAME} home`}
        >
          <Logo className="h-10 sm:h-12" />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Everything free, one tap away: "Menu" on phones, "Free resources" on laptops. */}
          <button
            type="button"
            aria-expanded={menu}
            aria-controls="study-menu"
            aria-label={menu ? "Close menu" : "Open menu"}
            onClick={() => setMenu((v) => !v)}
            className={`group inline-flex h-11 items-center justify-center rounded-full text-base font-medium text-muted-foreground transition-colors hover:text-ink max-sm:w-11 max-sm:border max-sm:border-white/[0.14] max-sm:bg-white/[0.04] sm:px-4 ${focusRing}`}
          >
            {/* Phones: two fine lines that cross into a close mark. Laptops: the words. */}
            <span aria-hidden className="relative block h-3 w-[18px] sm:hidden">
              <span className={`absolute left-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-200 ${menu ? "top-[5px] rotate-45" : "top-[2px]"}`} />
              <span className={`absolute left-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-200 ${menu ? "top-[5px] -rotate-45" : "top-[9px]"}`} />
            </span>
            <span className="hidden sm:inline">Free resources</span>
          </button>
          <Link
            href={isStudent ? "/dashboard" : "/login"}
            // Not fetched in the background: the sign-in page brings the whole portal
            // (Supabase, the data store), which visitors never need. Hover, focus or a
            // touch starts the download instead, just before the tap lands.
            prefetch={false}
            onPointerEnter={preloadPortal}
            onFocus={preloadPortal}
            onTouchStart={preloadPortal}
            className={`hidden min-h-11 items-center rounded-full px-3 text-base font-medium text-muted-foreground transition-colors hover:text-ink sm:inline-flex sm:px-4 ${focusRing}`}
          >
            {isStudent ? "Dashboard" : "Login"}
          </Link>
          <BookButton
            from="nav"
            className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.98] sm:min-h-12 sm:px-6 sm:text-base ${
              heroCta
                ? "border-white/20 bg-transparent text-ink hover:border-white/40"
                : "border-gold bg-gold text-band-b hover:bg-gold-hover"
            } ${focusRing}`}
          >
            Book free trial
          </BookButton>
        </div>
      </div>
      <div className="relative mx-auto max-w-6xl">
        <StudyMenu open={menu} onClose={() => setMenu(false)} account={account} />
      </div>
    </header>
  );
}
