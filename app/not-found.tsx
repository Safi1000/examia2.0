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
    <MarketingShell>
      <section className="flex min-h-[70dvh] items-center py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-5 text-center">
          <p
            aria-hidden
            className="select-none text-[clamp(6rem,22vw,11rem)] font-extrabold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1.5px_rgba(251,193,89,0.55)]"
          >
            404
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-foreground md:text-5xl">
            This page isn&apos;t on the syllabus.
          </h1>
          <p className="mt-5 max-w-[46ch] text-balance text-[17px] leading-relaxed text-muted-foreground">
            The link may be old or mistyped. Everything you need is on the home page.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="btn-shine inline-flex min-h-12 items-center rounded-full bg-gold px-7 text-[15px] font-semibold text-[#1b1e21] transition-[background-color,transform] hover:bg-[#ffd07a] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
        </div>
      </section>
    </MarketingShell>
  );
}
