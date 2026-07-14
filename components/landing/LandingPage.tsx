"use client";

import { Hero } from "./Hero";
import {
  TrustBar,
  FreeLesson,
  Difference,
  HowITeach,
  InsideClass,
  MeetHamza,
  Reviews,
  Faq,
  Closing,
} from "./Sections";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Grain } from "./Grain";
import { MobileCta } from "./MobileCta";
import { ScrollProgress } from "./ScrollProgress";
import { SectionRail } from "./SectionRail";
import { LeadGateProvider } from "./LeadGate";

/**
 * Public marketing homepage. Self-contained: it owns its own nav/footer and its
 * design tokens are scoped to `.landing` (see globals.css), so it never leaks
 * into the student, admin, or test-runner surfaces.
 */
export function LandingPage() {
  return (
    <LeadGateProvider>
      <div className="landing">
        <a
          href="#main"
          className="sr-only focus:not-sr-only fixed left-4 top-4 z-[110] rounded-full bg-gold px-4 py-2 text-sm font-semibold text-[#1b1e21]"
        >
          Skip to content
        </a>

        <ScrollProgress />
        <Nav />

        <main id="main">
          <SectionRail />
          <Hero />
          <TrustBar />
          <FreeLesson />
          <Difference />
          <HowITeach />
          <InsideClass />
          <MeetHamza />
          <Reviews />
          <Faq />
          <Closing />
        </main>

        <Footer />
        <MobileCta />
        <Grain />

        {/* Fixed page vignette pulls the eye toward centre */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[80]"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>
    </LeadGateProvider>
  );
}
