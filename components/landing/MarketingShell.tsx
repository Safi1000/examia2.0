import type { ReactNode } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { MobileCta } from "./MobileCta";
import { CookieBanner } from "./CookieBanner";
import { BookingProvider } from "./BookingModal";
import { Backdrop } from "./Backdrop";

/**
 * Frame for the public pages beyond the homepage (subject pages, tools). Same
 * nav, footer and tokens as `/`, without the homepage's grain, vignette and
 * scroll bar, so the inner pages stay calm and fast.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <BookingProvider>
    <div className="landing relative isolate">
      <Backdrop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only fixed left-4 top-4 z-[110] rounded-full bg-gold px-4 py-2 text-sm font-semibold text-[#1b1e21]"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
      <MobileCta />
      <CookieBanner />
    </div>
    </BookingProvider>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{children}</p>
  );
}

/** Server-rendered FAQ: native disclosure, works without JavaScript. */
export function FaqList({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div>
      {items.map((f, i) => (
        <details key={f.q} open={i === 0} className="group border-b border-hairline">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 text-base font-semibold text-foreground md:text-lg">{f.q}</span>
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-faint transition-transform group-open:rotate-45 group-open:border-gold-border group-open:text-gold"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M7 1v12M1 7h12" />
              </svg>
            </span>
          </summary>
          <p className="max-w-[62ch] pb-6 pr-12 text-[17px] leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
