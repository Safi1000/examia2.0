import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { breadcrumbLd, faqLd } from "@/lib/seo";

/**
 * Private candidates in the UAE: how to enter Cambridge IGCSE and AS/A Level
 * through the British Council. Facts are from the British Council UAE
 * candidate information flyers and declaration form only; update the table
 * when the May / June 2027 flyer is out.
 */
const title = "Private Candidate Guide UAE: IGCSE and A Level 2027";
const description =
  "How to sit Cambridge IGCSE and A Level as a private candidate in the UAE: British Council registration, documents, the No Objection Certificate and deadlines.";
const UPDATED = "2026-10-23";

export const metadata: Metadata = {
  title: `${title} | Hamza Teaches`,
  description,
  alternates: { canonical: "/private-candidates/uae" },
  openGraph: { title, description, url: "/private-candidates/uae", type: "article", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Can I sit IGCSE or A Level without a school in the UAE?",
    a: "Yes. You register as a private candidate with the British Council, which has offices in Abu Dhabi, Dubai and Sharjah and runs Cambridge exam sessions at its Abu Dhabi and Dubai centres.",
  },
  {
    q: "Do I need a No Objection Certificate?",
    a: "The British Council says private candidates registering for IGCSE or Cambridge International AS and A Level must submit one. If you are at a school recognised by the Ministry of Education, the declaration form asks for a No Objection Certificate from that school.",
  },
  {
    q: "Can I get my fee back if I change my mind?",
    a: "No. The British Council says exam fees are non-refundable and non-transferable, and they are not carried forward to a later session.",
  },
  {
    q: "Will my certificate be accepted for further study in the UAE?",
    a: "The British Council says certificates it issues to private candidates will not be endorsed by the Ministry of Education. Ask your university or next school what they accept before you register.",
  },
  {
    q: "Are Accounting, Business and Economics a good choice as a private candidate?",
    a: "Yes. They are assessed by written papers only, so you need no laboratory or coursework. What you do need is past paper practice and feedback on your written answers.",
  },
];

export default function PrivateCandidatesUae() {
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Private candidates, UAE", path: "/private-candidates/uae" },
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
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Private candidate guide, UAE" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Sitting IGCSE or A Level as a private candidate in the UAE
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Updated 23 October 2026. How British Council registration works in the UAE, the documents to keep ready, the deadlines, and
          the two rules private candidates most often miss.
        </p>

        <Section title="Read these two rules first">
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Certificates are not endorsed by the Ministry of Education.</strong> The British Council says
              this applies to certificates it issues. If you plan to continue studying in the UAE, ask the university or school what it accepts
              before you pay.
            </li>
            <li>
              <strong className="text-foreground">One centre, one board, one session.</strong> You can register with only one exam centre and
              one exam board for a given session.
            </li>
          </ul>
        </Section>

        <Section title="How registration works">
          <ol className="list-decimal space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Register online with the British Council.</strong> Choose the session, Cambridge as the board, and
              your subjects. Check the syllabus code carefully: IGCSE Accounting is 0452 and O Level Accounting is 7707, and they are different
              exams.
            </li>
            <li>
              <strong className="text-foreground">Send your documents within three working days.</strong> Email them to the British Council&apos;s
              Dubai school exams team, or take them to a British Council office. The declaration form says your registration stays incomplete
              until they arrive.
            </li>
            <li>
              <strong className="text-foreground">Pay the fee.</strong> If you pay at the office, the fee is due when you hand in your documents,
              by cash or credit card.
            </li>
            <li>
              <strong className="text-foreground">Sit the exams.</strong> The British Council runs Cambridge exam sessions at its Abu Dhabi and
              Dubai centres. Candidates registered at the Sharjah office sit their exams in Dubai.
            </li>
          </ol>
        </Section>

        <Section title="Documents to keep ready">
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-body">
            <li>Your passport or Emirates ID, valid, the original and a copy.</li>
            <li>Three passport-size photographs taken within the last six months.</li>
            <li>A copy of your online registration summary.</li>
            <li>The signed candidate declaration form.</li>
            <li>A No Objection Certificate. If you are at a school recognised by the Ministry of Education, it comes from that school.</li>
          </ul>
        </Section>

        <Section
          title="Deadlines"
          intro={
            <p>
              The British Council publishes a registration schedule for every session. After the regular window, a late stage runs for a few
              weeks at a higher fee. These are the latest published Cambridge dates.
            </p>
          }
        >
          <Table
            caption="British Council UAE Cambridge registration dates"
            head={["Session", "Regular registration", "Late stage 1"]}
            rows={[
              ["May / June 2026", "2 December 2025 to 13 February 2026", "14 February to 10 April 2026"],
              ["October / November 2026", "26 June to 7 August 2026", "8 August to 14 September 2026"],
              ["May / June 2027", "Not published yet", "Not published yet"],
            ]}
          />
        </Section>

        <Section title="Fees">
          <p className="text-[17px] leading-relaxed text-body">
            The British Council publishes a Cambridge price list for each session, per subject. Fees are non-refundable and non-transferable,
            and they are not carried forward to a later session, so check your subjects and paper options before you pay.
          </p>
        </Section>

        <Section title="Preparing on your own">
          <p className="text-[17px] leading-relaxed text-body">
            The hard part on your own is not finding past papers. It is knowing why an answer you thought was right only got half the marks.
            Accounting formats, Business evaluation and Economics analysis are where self-study students lose the most, because nobody marks
            their written answers.
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-body">
            Classes run from 2:30 pm to 8:30 pm UAE time, Monday to Friday: see the{" "}
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
          from="private-candidates:uae"
          title="No school. Still not alone."
          body="Live small-group classes online for IGCSE, O Level, AS and A Level Accounting, Business and Economics, with weekly tests I mark myself. Private candidates are welcome. Start with one free lesson."
        />

        <Section title="Questions private candidates ask">
          <FaqList items={FAQ} />
        </Section>

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Sources:{" "}
          <a href="https://www.britishcouncil.ae/sites/default/files/cambridge_candidate_information_flyer_june_2026.pdf" className="hover:text-gold" rel="noopener">
            British Council UAE, Cambridge candidate information, May / June 2026
          </a>
          ,{" "}
          <a href="https://www.britishcouncil.ae/sites/default/files/candidate_information_flyer_-_oct_nov_2026.pdf" className="hover:text-gold" rel="noopener">
            October / November 2026
          </a>
          ,{" "}
          <a href="https://www.britishcouncil.ae/sites/default/files/declaration_by_candidate_0.pdf" className="hover:text-gold" rel="noopener">
            declaration by candidate
          </a>
          . Fees and dates change each session: always confirm with the British Council before you pay.
        </p>
      </article>
    </MarketingShell>
  );
}
