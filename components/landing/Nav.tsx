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
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
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
          {/* The one free resource most visitors from Google come for. Hidden on phones to keep the bar clean. */}
          <Link
            href="/past-papers"
            className={`hidden min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex sm:px-4 ${focusRing}`}
          >
            Past papers
          </Link>
          <Link
            href={isStudent ? "/dashboard" : "/login"}
            // Not fetched in the background: the sign-in page brings the whole portal
            // (Supabase, the data store), which visitors never need. Hover, focus or a
            // touch starts the download instead, just before the tap lands.
            prefetch={false}
            onPointerEnter={preloadPortal}
            onFocus={preloadPortal}
            onTouchStart={preloadPortal}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-4 ${focusRing}`}
          >
            {isStudent ? "Dashboard" : "Login"}
          </Link>
          <BookButton
            from="nav"
            className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-300 active:scale-[0.97] sm:min-h-12 sm:px-6 sm:text-[15px] ${
              heroCta
                ? "border-white/20 bg-transparent text-foreground hover:border-white/40"
                : "border-gold bg-gold text-[#1b1e21] hover:bg-gold-hover"
            } ${focusRing}`}
          >
            Book free trial
          </BookButton>
        </div>
      </div>
    </header>
  );
}
