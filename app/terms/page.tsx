import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/LegalPage";
import { waLink } from "@/lib/landing";

export const metadata: Metadata = {
  title: "Terms of Use | Hamza Teaches",
  description: "The terms for free trial lessons, classes, recordings and the student portal at Hamza Teaches.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of use"
      updated="16 October 2026"
      intro={
        <p>
          These terms cover the free trial lesson, the classes, the recordings and the student portal. They are
          written to be read. If anything is unclear, ask me on{" "}
          <a href={waLink()} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold hover:underline">
            WhatsApp
          </a>
          .
        </p>
      }
      sections={[
        {
          h: "Free trial lesson",
          body: (
            <p>
              The trial lesson is free and comes with no obligation. Booking through the site sends me your preferred
              time on WhatsApp; the booking is confirmed only when I reply in the chat.
            </p>
          ),
        },
        {
          h: "Fees and payment",
          body: (
            <p>
              Fees depend on level and number of subjects, and are shared privately on WhatsApp before you join.
              They are paid monthly, in advance, before that month&apos;s classes start. You can pay by bank transfer,
              JazzCash or Easypaisa, or by card or online payment if you are outside Pakistan.
            </p>
          ),
        },
        {
          h: "Refunds",
          body: (
            <p>
              Fees are not refundable once paid, including if a student stops attending part-way through. That is
              why the first lesson is free: you can see how I teach before you pay anything.
            </p>
          ),
        },
        {
          h: "Classes and missed lessons",
          body: (
            <p>
              Classes run live online in small groups on Google Meet or Zoom. If I have to miss or cancel a
              class, I make it up with an extra class. If a student misses a class, it is not repeated, but every
              session is recorded and sent the same night, so nothing is lost.
            </p>
          ),
        },
        {
          h: "Recordings, notes and tests",
          body: (
            <p>
              Recordings, notes, tests and other material are for the enrolled student&apos;s own study. Please don&apos;t
              share, sell or re-upload them.
            </p>
          ),
        },
        {
          h: "The student portal",
          body: (
            <p>
              I create portal accounts for enrolled students. Keep your login to yourself; tell me straight away if
              someone else may have it. I may pause an account that is misused. How portal information is handled is
              explained in the <Link href="/privacy" className="font-semibold text-gold hover:underline">privacy policy</Link>.
            </p>
          ),
        },
        {
          h: "Results",
          body: (
            <p>
              I will teach the whole syllabus, set and mark weekly practice, and tell you honestly where you stand.
              Exam results also depend on the student&apos;s own work, so no tutor can promise a grade. The grade
              predictor on this site gives an estimate only; exam boards set new grade thresholds every session.
            </p>
          ),
        },
        {
          h: "Changes and law",
          body: (
            <p>
              If these terms change, the new version goes on this page with a new date. These terms are governed by
              the laws of Pakistan.
            </p>
          ),
        },
      ]}
    />
  );
}
