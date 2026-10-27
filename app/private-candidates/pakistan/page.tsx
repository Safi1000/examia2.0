import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

/**
 * Private candidates in Pakistan: how to enter Cambridge O Level, IGCSE and
 * AS/A Level through the British Council, and how to prepare Accounting,
 * Business and Economics without a school. Dates are the British Council's
 * own published deadlines; update them when the May / June 2027 table is out.
 */
const title = "Private Candidate Guide Pakistan: O Level and A Level 2027";
const description =
  "How to sit Cambridge O Level, IGCSE and A Level as a private candidate in Pakistan: British Council registration, deadlines, fees, and a study plan for 2027.";
const UPDATED = "2026-10-23";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/private-candidates/pakistan" },
  openGraph: { title, description, url: "/private-candidates/pakistan", type: "article", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Can I sit O Levels or A Levels without a school in Pakistan?",
    a: "Yes. You enter as a private candidate through the British Council, which registers you, takes your fees and seats you at one of its exam venues.",
  },
  {
    q: "How much is the Cambridge exam fee for a private candidate?",
    a: "The British Council shows the exact fee for each subject inside its online registration system, so check it there when you register. Fees are charged per subject, and entering after the normal deadline costs more.",
  },
  {
    q: "When is the registration deadline for May / June 2027?",
    a: "The British Council publishes the table a few months before each session. For May / June 2026 the normal deadline was 12 February 2026 and the first late stage was 17 March 2026, so expect a similar window for 2027 and check the official page.",
  },
  {
    q: "Are Accounting, Business and Economics a good choice as a private candidate?",
    a: "Yes. They are assessed by written papers only, so you do not need a school laboratory or a teacher to sign off coursework. What you do need is past paper practice and feedback on your written answers.",
  },
  {
    q: "Can I retake a subject to improve my grade?",
    a: "Yes. You can enter again in a later session as a private candidate. The British Council lists the retake deadline with each session's dates.",
  },
];

export default function PrivateCandidatesPakistan() {
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Private candidates", path: "/private-candidates/pakistan" },
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
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Private candidate guide, Pakistan" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Sitting O Level, IGCSE or A Level as a private candidate in Pakistan
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Updated 23 October 2026. Everything you need to enter Cambridge exams without a school: how British Council registration
          works, the deadlines, what to keep ready, and how to prepare Accounting, Business and Economics on your own.
        </p>

        <Section title="Who sits as a private candidate">
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-body">
            <li>Students whose school does not offer the subject, such as O Level Accounting at a school without a commerce teacher.</li>
            <li>Students taking a gap year, studying at home, or finishing A Levels after leaving school.</li>
            <li>Students retaking a subject to improve a grade for a university or scholarship application.</li>
            <li>Students who want to finish O Levels in fewer years by taking extra subjects alongside school.</li>
          </ul>
        </Section>

        <Section
          title="How registration works"
          intro={<p>In Pakistan, private candidates enter Cambridge exams through the British Council, not through Cambridge directly.</p>}
        >
          <ol className="list-decimal space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Create an account in the British Council registration system (SRS).</strong> A parent or guardian
              completes it if you are under 18.
            </li>
            <li>
              <strong className="text-foreground">Choose the session, qualification and subjects.</strong> Check the syllabus code carefully: O Level
              Accounting is 7707, IGCSE Accounting is 0452, and they are different exams. Pick the paper options your syllabus lists.
            </li>
            <li>
              <strong className="text-foreground">Check your details before you submit.</strong> Your name and date of birth must match your ID
              exactly, because they are printed on your certificate.
            </li>
            <li>
              <strong className="text-foreground">Pay the fee at the bank.</strong> The system shows the exact amount for each subject. Keep the
              payment slip.
            </li>
            <li>
              <strong className="text-foreground">Send the payment slip and your registration summary to your British Council office.</strong> The
              British Council says registration is only complete once it receives both.
            </li>
            <li>
              <strong className="text-foreground">Wait for your Statement of Entry.</strong> It lists your subjects, papers, dates and venue. Check it
              the day it arrives and report any mistake straight away.
            </li>
          </ol>
        </Section>

        <Section
          title="Deadlines"
          intro={
            <p>
              The British Council publishes a deadline table for every session. Entering late is possible for a while, at a higher fee. These are
              the latest published dates.
            </p>
          }
        >
          <Table
            caption="British Council Pakistan deadlines"
            head={["Session", "Normal deadline", "Late stage"]}
            rows={[
              ["May / June 2026", "12 February 2026", "17 March 2026 (first late stage)"],
              ["October / November 2026", "6 August 2026", "3 September 2026 (late stage and retakes)"],
              ["May / June 2027", "Not published yet", "Expect a similar February to March window"],
            ]}
          />
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Modified papers and access arrangements have earlier deadlines (for October / November 2026 they were 29 June and 21 July 2026).
            Apply early if you need them.
          </p>
        </Section>

        <Section title="May / June or October / November?">
          <p className="text-[17px] leading-relaxed text-body">
            May / June is the main session and the one most students sit. October / November is smaller and is
            often used for retakes and for finishing A Level after AS. If you are starting a subject from zero now, aim for May / June 2027 and
            keep October / November 2027 as your backup.
          </p>
        </Section>

        <Section title="A study plan from now to May / June 2027">
          <Table
            caption="Study plan"
            head={["Months", "What to do"]}
            rows={[
              ["November to January", "Cover the full syllabus once, topic by topic. Make one page of notes per topic."],
              ["February", "Topic-wise past paper questions for every topic. Mark them strictly with the mark scheme."],
              ["March to April", "Full timed past papers, two a week per subject. Fix every mistake the same week."],
              ["May", "Last three sessions' papers under exam conditions. Revise only your weakest topics."],
            ]}
          />
          <p className="mt-5 text-[17px] leading-relaxed text-body">
            The hard part on your own is not finding past papers. It is knowing why an answer you thought was right only got half the marks.
            Accounting formats, Business evaluation and Economics analysis are where students studying alone lose the most, because nobody marks
            their written answers.
          </p>
          <p className="mt-4 text-[17px] leading-relaxed text-body">
            To see the marks you need, use the{" "}
            <Link href="/grade-thresholds" className="text-gold hover:underline">
              official grade thresholds
            </Link>{" "}
            and the{" "}
            <Link href="/tools/grade-predictor" className="text-gold hover:underline">
              grade predictor
            </Link>
            .
          </p>
        </Section>

        <TrialBox
          from="private-candidates:pakistan"
          title="No school. Still not alone."
          body="Live small group classes online for O Level, IGCSE, AS and A Level Accounting, Business and Economics, with weekly tests I mark myself. Private candidates are welcome. Start with one free lesson."
        />

        <Section title="Questions private candidates ask">
          <FaqList items={FAQ} />
        </Section>

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Sources:{" "}
          <a href="https://www.britishcouncil.pk/exam/international-schools-igcse-a-levels/private-candidates/registration" className="hover:text-gold" rel="noopener">
            British Council Pakistan, private candidate registration
          </a>
          ,{" "}
          <a href="https://www.britishcouncil.pk/exam/international-schools-igcse-a-levels/private-candidates/results/retakes-remarking" className="hover:text-gold" rel="noopener">
            retakes and remarks
          </a>
          . Fees and dates change each session: always confirm on the British Council page before you pay.
        </p>
      </article>
    </MarketingShell>
  );
}
