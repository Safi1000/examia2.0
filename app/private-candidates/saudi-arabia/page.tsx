import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { breadcrumbLd } from "@/lib/seo";

/**
 * Private candidates in Saudi Arabia. The British Council Saudi Arabia pages
 * publish less than the UAE and Pakistan ones (no current deadline table,
 * fee list or document list for school exams), so this guide says only what
 * they say and gives the questions to put to the office. Add a dates table
 * once the British Council publishes one.
 */
const title = "Private Candidate Guide Saudi Arabia: IGCSE and A Level";
const description =
  "How to sit Cambridge IGCSE and A Level as a private candidate in Saudi Arabia through the British Council in Riyadh, Jeddah or Al Khobar, and what to ask first.";
const UPDATED = "2026-10-23";

export const metadata: Metadata = {
  title: `${title} | Hamza Teaches`,
  description,
  alternates: { canonical: "/private-candidates/saudi-arabia" },
  openGraph: { title, description, url: "/private-candidates/saudi-arabia", type: "article", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

export default function PrivateCandidatesSaudiArabia() {
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Private candidates, Saudi Arabia", path: "/private-candidates/saudi-arabia" },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          description,
          dateModified: UPDATED,
          datePublished: UPDATED,
          inLanguage: "en",
          author: { "@type": "Person", name: "Hamza Sadaqat" },
        }}
      />

      <article className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Private candidate guide, Saudi Arabia" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Sitting IGCSE or A Level as a private candidate in Saudi Arabia
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Updated 23 October 2026. The British Council in Saudi Arabia publishes less detail online than it does in the UAE or Pakistan. So
          this guide is short: what it does say, and the questions to ask the office before you pay anything.
        </p>

        <Section title="Who handles your entry">
          <p className="text-[17px] leading-relaxed text-body">
            Without a school, you enter Cambridge exams through the British Council, which has a separate registration route for private
            candidates. It has offices in Riyadh, in the Diplomatic Quarter, and in Jeddah and Al Khobar. Contact the one nearest you: it is
            also where special arrangement requests and corrections go.
          </p>
        </Section>

        <Section title="The two sessions">
          <p className="text-[17px] leading-relaxed text-body">
            Cambridge exams run in May / June and in October / November. Each exam board has its own
            registration dates, so the dates for Cambridge are not the same as the dates for Pearson Edexcel.
          </p>
        </Section>

        <Section title="Three rules the British Council states">
          <ul className="list-disc space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Late entry costs more.</strong> You may be able to register after the deadline, but late
              registration carries extra fees.
            </li>
            <li>
              <strong className="text-foreground">Special arrangements need six weeks.</strong> Apply to the office at least six weeks before
              your exam date, with a medical certificate issued in the last two years.
            </li>
            <li>
              <strong className="text-foreground">Mistakes have a deadline too.</strong> If anything in your entry is wrong, contact the
              office straight away. Each session has a cut-off for corrections.
            </li>
          </ul>
        </Section>

        <Section title="What to ask the office before you pay">
          <ol className="list-decimal space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>When do regular and late registration open and close for May / June 2027?</li>
            <li>What is the fee for each of my subjects, and can it be refunded if I withdraw?</li>
            <li>Which documents do you need from me, and how do I send them?</li>
            <li>Where will I sit the exams?</li>
            <li>If I am still enrolled at a school, do I need anything from it?</li>
          </ol>
          <p className="mt-5 text-[17px] leading-relaxed text-body">
            Write the answers down with the date and the name of the person you spoke to. If anything changes later, you have a record.
          </p>
        </Section>

        <Section title="Fitting study around a Saudi week">
          <p className="text-[17px] leading-relaxed text-body">
            The school week here runs Sunday to Thursday, and my classes run Monday to Friday, from 1:30 pm Saudi time. The{" "}
            <Link href="/online-classes/riyadh" className="text-gold hover:underline">Riyadh</Link> and{" "}
            <Link href="/online-classes/jeddah" className="text-gold hover:underline">Jeddah</Link> pages show every class on your clock and how
            the two weeks fit together.
          </p>
        </Section>

        <TrialBox
          from="private-candidates:saudi-arabia"
          title="Your entry. My marking."
          body="Private candidates in Saudi Arabia join the same live classes as school students, and every weekly test is marked by me with written feedback. Start with one free lesson."
        />

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Sources:{" "}
          <a href="https://www.britishcouncil.sa/en/exam/igcse-school/register" className="hover:text-gold" rel="noopener">
            British Council Saudi Arabia, how to register
          </a>
          ,{" "}
          <a href="https://www.britishcouncil.sa/en/exam/igcse-school/register/dates-deadlines" className="hover:text-gold" rel="noopener">
            registration dates and deadlines
          </a>
          ,{" "}
          <a href="https://www.britishcouncil.sa/english/schools/riyadh/mens" className="hover:text-gold" rel="noopener">
            Riyadh office
          </a>
          . Fees and dates change each session: always confirm with the British Council before you pay.
        </p>
      </article>
    </MarketingShell>
  );
}
