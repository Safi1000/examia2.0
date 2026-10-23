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
    q: "I am still enrolled at a school. Can I enter a subject privately?",
    a: "Yes, if your school agrees. The declaration form has a box for exactly this: if you are at a school recognised by the Ministry of Education, you attach a No Objection Certificate from that school.",
  },
  {
    q: "Can I register at two centres, to be safe?",
    a: "No. The British Council allows one exam centre and one exam board per session, so choose before you register.",
  },
  {
    q: "I missed the regular deadline. Is it too late?",
    a: "Not straight away. After the regular window, a late stage runs for several weeks at a higher fee. For May / June 2026 it ran from 14 February to 10 April 2026.",
  },
  {
    q: "Can I get my fee back if I change my mind?",
    a: "No. The British Council says exam fees are non-refundable and non-transferable, and they are not carried forward to a later session.",
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
          the two rules to check before you pay.
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
              your subjects. Check every syllabus code, and Business in particular: from 2027, IGCSE Business is 0264 and O Level Business is
              7081.
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
              <strong className="text-foreground">Sit the exams.</strong> The British Council has offices in Abu Dhabi, Dubai and Sharjah.
              Candidates registered at the Sharjah office sit their exams in Dubai.
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

        <Section title="Working back from the deadline">
          <p className="text-[17px] leading-relaxed text-body">
            If the May / June 2027 window follows the 2026 pattern, registration opens in early December and the regular deadline falls in
            mid-February. Three things are worth doing before it opens:
          </p>
          <ul className="mt-5 list-disc space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Ask for the No Objection Certificate early.</strong> If it comes from your school, it is out of
              your hands until the school writes it.
            </li>
            <li>
              <strong className="text-foreground">Get the photos and copies done.</strong> You have only three working days after registering
              online to send everything.
            </li>
            <li>
              <strong className="text-foreground">Settle your subject list.</strong> The fee cannot be refunded or moved to a later session, so
              decide on subjects and paper options first.
            </li>
          </ul>
          <p className="mt-6 text-[17px] leading-relaxed text-body">
            Then the work that actually decides your grade: past papers, marked properly. Classes run from 2:30 pm to 8:30 pm UAE time,
            Monday to Friday, and the <Link href="/online-classes/dubai" className="text-gold hover:underline">Dubai</Link> and{" "}
            <Link href="/online-classes/abu-dhabi" className="text-gold hover:underline">Abu Dhabi</Link> pages show each class on your
            clock.
          </p>
        </Section>

        <TrialBox
          from="private-candidates:uae"
          title="On your own. Not alone."
          body="Private candidates in the UAE join the same live classes as school students, and every weekly test is marked by me with written feedback. Start with one free lesson."
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
