import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { BookButton } from "@/components/landing/BookingModal";

export const metadata: Metadata = {
  title: "Page not found | Hamza Teaches",
  robots: { index: false, follow: true },
};

/** Shown for any address that does not exist, in the public site's look. */
export default function NotFound() {
  return (
    <MarketingShell heroCta>
      <section className="flex min-h-[70dvh] items-center py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-5 text-center">
          <p className="text-[14px] font-semibold tabular-nums text-gold">Error 404</p>
          <h1 className="mt-4 text-balance text-3xl font-bold leading-tight text-foreground md:text-5xl">
            This page isn&apos;t on the syllabus.
          </h1>
          <p className="mt-5 max-w-[46ch] text-balance text-[17px] leading-relaxed text-muted-foreground">
            The link may be old or mistyped. Everything you need is on the home page.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/"
              data-hero-cta
              className="inline-flex min-h-12 items-center rounded-full bg-gold px-7 text-[15px] font-semibold text-[#1b1e21] transition-colors hover:bg-gold-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Back to the home page
            </Link>
            <BookButton
              from="404"
              className="inline-flex min-h-12 items-center rounded-full border border-hairline-strong px-7 text-[15px] font-semibold text-body transition-colors hover:border-gold-border hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Book a free trial lesson
            </BookButton>
          </div>
          <nav aria-label="Popular pages" className="mt-12 w-full max-w-md border-t border-hairline pt-6">
            <ul className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-[15px]">
              {[
                { href: "/past-papers", label: "Past papers" },
                { href: "/tools", label: "Free tools" },
                { href: "/blog", label: "The Exam Room" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-muted-foreground transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
    </MarketingShell>
  );
}
