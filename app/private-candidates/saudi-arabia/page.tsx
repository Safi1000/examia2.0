import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { breadcrumbLd, faqLd } from "@/lib/seo";

/**
 * Private candidates in Saudi Arabia. The British Council Saudi Arabia pages
 * publish less detail than the UAE and Pakistan ones (no current deadline
 * table, fee list or document list for school exams), so this guide states
 * only what those pages say and sends readers to the office for the rest.
 * Add the dates table once the British Council publishes one.
 */
const title = "Private Candidate Guide Saudi Arabia: IGCSE and A Level";
const description =
  "How to sit Cambridge IGCSE and A Level as a private candidate in Saudi Arabia through the British Council in Riyadh, Jeddah or Al Khobar, and how to prepare.";
const UPDATED = "2026-10-23";

export const metadata: Metadata = {
  title: `${title} | Hamza Teaches`,
  description,
  alternates: { canonical: "/private-candidates/saudi-arabia" },
  openGraph: { title, description, url: "/private-candidates/saudi-arabia", type: "article", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Can I sit IGCSE or A Level without a school in Saudi Arabia?",
    a: "Yes. The British Council in Saudi Arabia registers private candidates for IGCSE and school exams, with offices in Riyadh, Jeddah and Al Khobar.",
  },
  {
    q: "When are the Cambridge exams?",
    a: "Cambridge exams run in two sessions, May / June and October / November. Each exam board has its own registration dates, so check the British Council page for your session.",
  },
  {
    q: "Can I register after the deadline?",
    a: "The British Council says you may be able to register after the deadline, but late registration costs extra. Contact your local office.",
  },
  {
    q: "Are Accounting, Business and Economics a good choice as a private candidate?",
    a: "Yes. They are assessed by written papers only, so you need no laboratory or coursework. What you do need is past paper practice and feedback on your written answers.",
  },
];

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
      <JsonLd data={faqLd(FAQ)} />

      <article className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Private candidate guide, Saudi Arabia" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Sitting IGCSE or A Level as a private candidate in Saudi Arabia
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Updated 23 October 2026. What the British Council in Saudi Arabia says about entering Cambridge exams without a school, and what to
          ask your local office. I have kept to what it publishes, so where a detail is missing, the office is the place to ask.
        </p>

        <Section title="How entry works">
          <ol className="list-decimal space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Register with the British Council.</strong> Its IGCSE and school exams pages have a separate
              registration route for private candidates. The offices are in Riyadh, Jeddah and Al Khobar.
            </li>
            <li>
              <strong className="text-foreground">Choose the right session and syllabus.</strong> Cambridge exams run in May / June and October /
              November. Check the syllabus code: IGCSE Accounting is 0452 and O Level Accounting is 7707, and they are different exams.
            </li>
            <li>
              <strong className="text-foreground">Check your entry as soon as you get it.</strong> If anything is wrong, contact your local
              British Council office straight away. Each session has a deadline for corrections.
            </li>
          </ol>
        </Section>

        <Section title="Deadlines">
          <p className="text-[17px] leading-relaxed text-body">
            The two exam boards have different registration dates. The British Council says you may be able to register after the deadline,
            at an extra fee for late registration. Ask your local office for the May / June 2027 dates before the start of the new year.
          </p>
        </Section>

        <Section title="Special arrangements">
          <p className="text-[17px] leading-relaxed text-body">
            If you need special arrangements, contact the British Council office in Riyadh, Jeddah or Al Khobar at least six weeks before your
            exam date. You need a medical certificate issued within the last two years.
          </p>
        </Section>

        <Section title="Questions to ask the office">
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-body">
            <li>What are the regular and late registration dates for May / June 2027?</li>
            <li>What is the fee for each of my subjects, and can it be refunded?</li>
            <li>Which documents do I need, and how do I send them?</li>
            <li>Where will I sit my exams?</li>
          </ul>
        </Section>

        <Section title="Preparing on your own">
          <p className="text-[17px] leading-relaxed text-body">
            The hard part on your own is not finding past papers. It is knowing why an answer you thought was right only got half the marks.
            Accounting formats, Business evaluation and Economics analysis are where self-study students lose the most, because nobody marks
            their written answers.
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-body">
            Classes run from 1:30 pm to 7:30 pm Saudi time, Monday to Friday: see the{" "}
            <Link href="/online-classes/gulf" className="text-gold hover:underline">
              class times for Gulf students
            </Link>
            . To see the marks you need, use the{" "}
            <Link href="/grade-thresholds" className="text-gold hover:underline">
              official grade thresholds
            </Link>
            .
          </p>
        </Section>

        <TrialBox
          from="private-candidates:saudi-arabia"
          title="No school. Still not alone."
          body="Live small-group classes online for IGCSE, O Level, AS and A Level Accounting, Business and Economics, with weekly tests I mark myself. Private candidates are welcome. Start with one free lesson."
        />

        <Section title="Questions private candidates ask">
          <FaqList items={FAQ} />
        </Section>

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Sources:{" "}
          <a href="https://www.britishcouncil.sa/en/exam/igcse-school/register" className="hover:text-gold" rel="noopener">
            British Council Saudi Arabia, how to register
          </a>
          ,{" "}
          <a href="https://www.britishcouncil.sa/en/exam/igcse-school/register/dates-deadlines" className="hover:text-gold" rel="noopener">
            registration dates and deadlines
          </a>
          . Fees and dates change each session: always confirm with the British Council before you pay.
        </p>
      </article>
    </MarketingShell>
  );
}
