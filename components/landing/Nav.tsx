"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { COMPANY_NAME } from "@/lib/config";
import { waLink, track } from "@/lib/landing";
import { Logo } from "@/components/Brand";
import { PillButton } from "./PillButton";

export function Nav() {
  const { session } = useAuth();

  // A signed-in student gets a way back into the portal instead of auth links.
  // Admins are untouched by the marketing surface and keep using /admin.
  const isStudent = session?.role === "student";

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-[rgba(33,36,39,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label={COMPANY_NAME}>
          {/* Wide cursive wordmark: needs real height to read as prominent.
              Mobile 48px · tablet 56px · desktop 64px, width:auto (ratio kept),
              vertically centred inside the taller navbar. */}
          <Logo className="h-12 sm:h-14 lg:h-16" />
        </Link>

        {/* Two actions only — same on every breakpoint, no hamburger, no rail. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <PillButton
            href={waLink()}
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
            className="px-3.5 py-2 text-[13px] sm:px-5"
            onClick={() => track("whatsapp_click", { from: "nav" })}
          >
            <span className="sm:hidden">WhatsApp</span>
            <span className="hidden sm:inline">Message on WhatsApp</span>
          </PillButton>

          <PillButton
            href={isStudent ? "/dashboard" : "/login"}
            className="px-3.5 py-2 text-[13px] sm:px-5"
          >
            {isStudent ? "Dashboard" : "Sign up"}
          </PillButton>
        </div>
      </div>
    </header>
  );
}
