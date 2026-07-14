"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { COMPANY_NAME } from "@/lib/config";
import { PillButton } from "./PillButton";

/** Anchors into the sections rendered on `/`. */
const SECTIONS = [
  { href: "#top", label: "Home" },
  { href: "#picker", label: "Features" },
  { href: "#meet", label: "About" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const { session } = useAuth();

  // A signed-in student gets a way back into the portal instead of auth links.
  // Admins are untouched by the marketing surface and keep using /admin.
  const isStudent = session?.role === "student";

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-[rgba(33,36,39,0.72)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span aria-hidden className="h-[9px] w-[9px] rounded-[3px] bg-gold" />
          <span className="text-[15px] font-bold tracking-tight text-foreground">{COMPANY_NAME}</span>
        </Link>

        {/* Single auth entry point: sign up and log in are the same page, so we
            surface one button rather than two links to the same destination. */}
        <nav className="hidden items-center gap-6 min-[900px]:flex" aria-label="Primary">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="text-sm text-faint transition-colors hover:text-foreground"
            >
              {s.label}
            </a>
          ))}

          <PillButton
            href={isStudent ? "/dashboard" : "/login"}
            className="px-5 py-2 text-[13px]"
          >
            {isStudent ? "Go to dashboard" : "Sign up"}
          </PillButton>
        </nav>

        <div className="flex items-center gap-2 min-[900px]:hidden">
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-body"
          >
            {open ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 3l12 12M15 3L3 15" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 6h16M2 12h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-hairline bg-band-b px-5 pb-6 pt-4 min-[900px]:hidden">
          <nav className="flex flex-col gap-1" aria-label="Primary">
            {SECTIONS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-sm font-semibold text-body hover:bg-card"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <PillButton
            href={isStudent ? "/dashboard" : "/login"}
            className="mt-3 w-full py-3 text-sm"
            onClick={() => setOpen(false)}
          >
            {isStudent ? "Go to dashboard" : "Sign up"}
          </PillButton>
        </div>
      )}
    </header>
  );
}
