"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOptionalAuth } from "@/lib/auth-context";
import { COMPANY_NAME } from "@/lib/config";
import { Logo } from "@/components/Brand";
import { BookButton } from "./BookingModal";
import { Magnetic } from "./Magnetic";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/**
 * Login and the one main action: book the free trial (opens the calendar).
 * WhatsApp lives in the floating button, bottom right (MobileCta.tsx).
 */
export function Nav() {
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

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={`glass-bar mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-full pl-5 pr-2 sm:h-[72px] sm:pl-7 sm:pr-3 ${
          scrolled ? "glass-bar--scrolled" : ""
        }`}
      >
        <Link href="/" className={`flex shrink-0 items-center rounded-lg ${focusRing}`} aria-label={`${COMPANY_NAME} home`}>
          <Logo className="h-10 sm:h-12" />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href={isStudent ? "/dashboard" : "/login"}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-4 ${focusRing}`}
          >
            {isStudent ? "Dashboard" : "Login"}
          </Link>
          <Magnetic strength={0.3}>
            <BookButton
              from="nav"
              className={`btn-shine inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-gold px-4 text-sm font-semibold text-[#1b1e21] transition-[background-color,transform] hover:bg-[#ffd07a] active:scale-[0.97] sm:min-h-12 sm:px-6 sm:text-[15px] ${focusRing}`}
            >
              Book free trial
            </BookButton>
          </Magnetic>
        </div>
      </div>
    </header>
  );
}
