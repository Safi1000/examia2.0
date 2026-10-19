"use client";

import { Hero } from "./Hero";
import { FreeLesson, Difference, MeetHamza, Reviews, Faq, Closing } from "./Sections";
import { InsideLesson } from "./InsideLesson";
import { TrustBar } from "./TrustCards";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { MobileCta } from "./MobileCta";
import { CookieBanner } from "./CookieBanner";
import { BookingProvider } from "./BookingModal";
import { Backdrop } from "./Backdrop";
import { IntroLogo } from "./IntroLogo";

/**
 * Public homepage: one funnel, ordered for a first-time visitor (see the
 * comment in <main>). Design tokens are scoped to `.landing` (see globals.css).
 */
export function LandingPage() {
  return (
    <BookingProvider>
      <div className="landing relative isolate">
        <Backdrop />
        <IntroLogo />
        <a
          href="#main"
          className="sr-only focus:not-sr-only fixed left-4 top-4 z-[110] rounded-full bg-gold px-4 py-2 text-sm font-semibold text-[#1b1e21]"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main">
          {/* A first-time visitor's path: what is this → can I trust it → how is it
              different → do students like it → what do I get → who is the teacher →
              pick my class → last doubts → book. */}
          <Hero />
          <TrustBar />
          <Difference />
          <Reviews />
          <InsideLesson />
          <MeetHamza />
          <FreeLesson />
          <Faq />
          <Closing />
        </main>
        <Footer />
        <MobileCta />
        <CookieBanner />
      </div>
    </BookingProvider>
  );
}
