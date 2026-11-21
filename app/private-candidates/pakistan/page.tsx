import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { articleLd, breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

/**
 * Private candidates in Pakistan: how to enter Cambridge O Level, IGCSE and
 * AS/A Level through the British Council, and how to prepare Accounting,
 * Business and Economics without a school. Facts checked against official
 * British Council and Cambridge pages on 21 November 2026
 * (seo/research-private-candidates-pk-2026-11-21.md). Still to update when
 * published: May / June 2027 British Council deadlines, late fee amounts,
 * private candidate centre cities, June 2027 IGCSE / O Level results date.
 */
const title = "O Level and A Level as a Private Candidate in Pakistan (2027)";
const description =
  "Register as a private candidate in Pakistan for Cambridge O Level, IGCSE and A Level 2027: deadlines, fees, Statement of Entry, documents and exam dates.";
const UPDATED = "2026-11-21";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/private-candidates/pakistan" },
  openGraph: { title, description, url: "/private-candidates/pakistan", type: "article", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const BC_REG = "https://www.britishcouncil.pk/exam/international-schools-igcse-a-levels/private-candidates/registration";
const SRS = "https://schoolexams.britishcouncil.org/select-country";

const inLink =
  "text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";
const srcLink = "underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:text-muted-foreground";

const SOURCES = [
  { href: BC_REG, label: "British Council Pakistan, private candidate registration" },
  { href: "https://www.britishcouncil.pk/exam/international-schools-igcse-a-levels/private-candidates/exam-day", label: "exam day" },
  { href: "https://www.britishcouncil.pk/exam/international-schools-igcse-a-levels/private-candidates/results", label: "results" },
  { href: "https://www.britishcouncil.pk/exam/international-schools-igcse-a-levels/private-candidates/results/refunds", label: "refunds and withdrawals" },
  { href: "https://www.britishcouncil.pk/exam/school/results/retakes-remarking", label: "retakes and remarks" },
  {
    href: "https://www.britishcouncil.pk/sites/default/files/pakistan_british_council_guide_to_making_entries_-_november_2026.pdf",
    label: "British Council guide to making entries (November 2026)",
  },
  { href: "https://internationalschools.britishcouncil.org/hubfs/International%20school%20exams%20B2C%20FAQs.pdf", label: "British Council candidate FAQs" },
  { href: SRS, label: "British Council SRS" },
  { href: "https://www.cambridgeinternational.org/Images/766282-june-2027-zone-4-timetable.pdf", label: "Cambridge June 2027 zone 4 timetable" },
  {
    href: "https://www.cambridgeinternational.org/news/news-details/view/as-a-level-june-results-released-earlier-from-2027-20261030/",
    label: "Cambridge, June AS and A Level results earlier from 2027",
  },
  { href: "https://www.cambridgeinternational.org/Images/746006-key-dates-for-november-2026-series-international-.pdf", label: "Cambridge November 2026 key dates" },
];

const FAQ = [
  {
    q: "Can I sit O Levels or A Levels without a school in Pakistan?",
    a: "Yes. You enter as a private candidate through the British Council. It registers you, takes your fees and gives you a Venue Letter for your exams.",
  },
  {
    q: "When is the registration deadline for May / June 2027?",
    a: "Not published yet. The British Council registration page currently shows only October / November 2026, whose deadlines (6 August and 3 September 2026) have passed. Check the British Council registration page for the May / June 2027 table.",
  },
  {
    q: "Can I register after the deadline?",
    a: "Sometimes. The British Council says registering or changing an entry after the deadline incurs a late fee and needs its approval. Your fee must also be paid by the deadline, not just your registration. Its retakes page notes that late entries can double or triple the fee.",
  },
  {
    q: "How much is the Cambridge exam fee for a private candidate?",
    a: "The British Council shows the exact fee for each subject inside its online registration system (SRS), not on a public page. Card payments also carry a 1% advance tax for filers or 3% for non filers, which is not refundable.",
  },
  {
    q: "What is the Statement of Entry?",
    a: "It is the British Council document that confirms your exam registration: your subjects, the exam date for each paper, your name, date of birth and school. You collect it with your Venue Letter 2 to 3 weeks before the series starts, and you bring a printed copy to every exam.",
  },
  {
    q: "What if my Statement of Entry has a mistake?",
    a: "Tell the British Council as soon as possible so it can submit an amendment. Cambridge says late fees may be charged for corrections made after the entry deadline.",
  },
  {
    q: "What ID do I need on exam day?",
    a: "Your printed Statement of Entry and your original CNIC. If you are a Pakistani under 18, bring your NADRA SMART Card. Candidates who are not Pakistani bring their passport.",
  },
  {
    q: "Where are the exam centres for private candidates?",
    a: "The British Council does not publish a current list of private candidate centres. Your venue is printed on the Venue Letter you collect with your Statement of Entry.",
  },
  {
    q: "When are the June 2027 exams and results?",
    a: "Pakistan sits zone 4 papers. The June 2027 zone 4 timetable runs from 26 April to 11 June 2027. Cambridge will release June 2027 AS and A Level results on 28 July 2027. The IGCSE and O Level results date for June 2027 is not published yet.",
  },
  {
    q: "Are Accounting, Business and Economics a good choice as a private candidate?",
    a: "Yes. They are assessed by written papers only, so you do not need a school laboratory or a teacher to sign off coursework. What you do need is past paper practice and feedback on your written answers.",
  },
  {
    q: "Can I retake a subject to improve my grade?",
    a: "Yes. You can enter again in a later session as a private candidate. The British Council lists the retake deadline with each session's dates. For October / November 2026 it was 3 September 2026.",
  },
];

export default function PrivateCandidatesPakistan() {
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Private candidate guide, Pakistan", path: "/private-candidates/pakistan" },
        ])}
      />
      <JsonLd
        data={articleLd({ path: "/private-candidates/pakistan", headline: title, description, datePublished: UPDATED })}
      />
      <JsonLd data={faqLd(FAQ)} />

      <article className="public-calm mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Private candidate guide, Pakistan" }]} />
        <h1 className="mt-8 text-title leading-[1.1] sm:text-title-lg">
          Sitting O Level, IGCSE or A Level as a private candidate in Pakistan
        </h1>
        <p className="mt-4 text-base text-muted-foreground">Updated 21 November 2026.</p>

        <Section
          id="registration"
          title="How do I register as a private candidate?"
          intro={<p>In Pakistan, private candidates enter Cambridge exams through the British Council, not through Cambridge directly.</p>}
        >
          <ol className="list-decimal space-y-3 pl-5 text-lg leading-relaxed text-body">
            <li>
              <strong className="text-foreground">
                Register in the{" "}
                <a href={SRS} className={inLink} rel="noopener">
                  British Council registration system (SRS)
                </a>
                .
              </strong>{" "}
              A parent or guardian must register you if you are under 18.
            </li>
            <li>
              <strong className="text-foreground">Choose the session, qualification and subjects.</strong> Check the syllabus code carefully: O Level
              Accounting is 7707, IGCSE Accounting is 0452, and they are different exams. You enter an option code for each syllabus. You cannot
              enter a single paper on its own.
            </li>
            <li>
              <strong className="text-foreground">Check your details before you submit.</strong> Your name and date of birth must match your ID
              exactly, because they are printed on your certificate. Your CNIC or B-Form number is now mandatory.
            </li>
            <li>
              <strong className="text-foreground">Pay before the deadline.</strong> The British Council does not process your application until
              it receives payment. The ways to pay are below.
            </li>
            <li>
              <strong className="text-foreground">If you pay at a bank, send the pink payment slip and your registration summary to your British Council office.</strong>{" "}
              The British Council says registration is completed once both are received. Do not hold on to them.
            </li>
            <li>
              <strong className="text-foreground">Collect your Statement of Entry and Venue Letter.</strong> Check them the day you get them and
              report any mistake straight away.
            </li>
          </ol>
        </Section>

        <Section
          id="deadlines"
          title="When is the registration deadline?"
          intro={
            <p>
              The May / June 2027 deadlines are not published yet. The October / November 2026 deadlines below have passed. Check the{" "}
              <a href={BC_REG} className={inLink} rel="noopener">
                British Council registration page
              </a>{" "}
              for the new table.
            </p>
          }
        >
          <Table
            caption="British Council Pakistan deadlines"
            head={["Session", "Normal deadline", "Late stage"]}
            rows={[
              ["October / November 2026", "6 August 2026 (passed)", "3 September 2026, late stage and retakes (passed)"],
              ["May / June 2027", "Not published yet", "Not published yet"],
            ]}
          />
          <h3 className="mt-8 text-xl font-semibold text-foreground">Can I register late?</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>Registering or changing an entry after the deadline incurs a late fee and needs British Council approval.</li>
            <li>The deadline covers payment too. A payment made after it is treated as late and charged the extra late fee.</li>
            <li>The late fee amount is not published. The British Council retakes page notes that late entries can double or triple the fee.</li>
          </ul>
          <h3 className="mt-8 text-xl font-semibold text-foreground">Modified papers and access arrangements</h3>
          <p className="mt-3 text-lg leading-relaxed text-body">
            These close earlier. For October / November 2026 the modified paper deadline was 29 June 2026. For access arrangements, contact the
            British Council at least six weeks before your exam. You must apply again for every series.
          </p>
        </Section>

        <Section id="fees" title="How much does it cost?">
          <Table
            caption="Private candidate fees published by the British Council"
            head={["Item", "What the British Council publishes"]}
            rows={[
              ["Exam fee per subject", "Shown inside SRS when you register. There is no public PKR fee table."],
              ["Card payments", "1% advance tax for filers, 3% for non filers, on international card payments. Not refundable."],
              ["Withdrawal before the deadline", "PKR 1,500 per subject is deducted from your refund."],
              ["Withdrawal after the deadline", "Only for a serious reason, with 25% of the total fee deducted. No refund in the late period except on medical grounds, at the awarding body's discretion."],
              ["Late entry", "A late fee applies. The amount is not published."],
            ]}
          />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Retake costs depend on the syllabus and the number of components, says the British Council.
          </p>
        </Section>

        <Section id="payment" title="How do I pay?">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>
              <strong className="text-foreground">Credit or debit card.</strong> The 1% or 3% advance tax applies.
            </li>
            <li>
              <strong className="text-foreground">ATM or IBFT transfer</strong> to the Virtual Account you are given after you register.
            </li>
            <li>
              <strong className="text-foreground">Bank draft or deposit</strong> at a Standard Chartered Bank branch. Then send the pink slip and
              your registration summary to the British Council.
            </li>
          </ul>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Registering is not enough on its own. The fee must be paid by the deadline.
          </p>
        </Section>

        <Section id="documents" title="What documents do I need?">
          <Table
            caption="Documents for private candidates"
            head={["When", "What you need"]}
            rows={[
              ["At registration", "Your CNIC number, or your B-Form number if you are under 18. Candidates who are not Pakistani use their passport."],
              ["On exam day", "A printed Statement of Entry and your original CNIC. Pakistanis under 18 bring their NADRA SMART Card. Others bring their passport."],
            ]}
          />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Without your ID and Statement of Entry you may not be allowed to sit the exam.
          </p>
        </Section>

        <Section id="statement-of-entry" title="What is the Statement of Entry?">
          <p className="text-lg leading-relaxed text-body">
            It is the document that confirms your exam registration. It shows your subjects, the exam date for each paper, your name, date of
            birth and school, along with your candidate number and entry codes.
          </p>
          <h3 className="mt-8 text-xl font-semibold text-foreground">When and how you get it</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>You collect it from the British Council with your Venue Letter, 2 to 3 weeks before the series starts.</li>
            <li>You get an SMS or email when it is ready. Collect it within 3 working days.</li>
            <li>You, or a parent or guardian with a valid passport or national ID, can collect it.</li>
            <li>Bring a printed copy to every exam.</li>
          </ul>
          <h3 className="mt-8 text-xl font-semibold text-foreground">What to check</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>Your name is spelt exactly as you want it on your certificate.</li>
            <li>Your date of birth and gender are correct.</li>
            <li>The number of syllabuses is right, with no components you did not expect.</li>
            <li>There are no warning notices.</li>
          </ul>
          <h3 className="mt-8 text-xl font-semibold text-foreground">If something is wrong</h3>
          <p className="mt-3 text-lg leading-relaxed text-body">
            Tell the British Council as soon as possible so it can submit an amendment. Cambridge says late fees may be charged for corrections made
            after the entry deadline. For queries, the British Council lists info@britishcouncil.org.pk.
          </p>
        </Section>

        <Section id="exam-centres" title="Where will I sit the exam?">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>The British Council does not publish a current list of private candidate centres or cities.</li>
            <li>Your venue is printed on the Venue Letter you collect with your Statement of Entry.</li>
            <li>To ask for a transfer, contact the centre you first registered with.</li>
            <li>Arrive 60 minutes before the exam starts.</li>
            <li>If you sit some subjects at school, the British Council does not arrange clashes between school and private candidate exams.</li>
          </ul>
        </Section>

        <Section id="exam-dates" title="When are the exams and results?">
          <Table
            caption="Cambridge exam and results dates"
            head={["What", "Date"]}
            rows={[
              ["June 2027 exams, zone 4 (Pakistan)", "26 April to 11 June 2027"],
              ["June 2027 AS and A Level results", "28 July 2027"],
              ["June 2027 IGCSE and O Level results", "Not published yet (18 August in 2026)"],
              ["November 2026 AS and A Level results", "7 January 2027"],
              ["November 2026 IGCSE and O Level results", "14 January 2027"],
            ]}
          />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Pakistan is Cambridge zone 4. You do not choose your zone or paper version: it follows from entering through the British Council in
            Pakistan. Check your own papers on the Cambridge timetable and your Statement of Entry.
          </p>
        </Section>

        <Section title="May / June or October / November?">
          <p className="text-lg leading-relaxed text-body">
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
              ["November to January", <>Cover the full <Link href="/syllabus" className={inLink}>syllabus</Link> once, topic by topic. Make one page of notes per topic.</>],
              ["February", <><Link href="/past-papers/topics" className={inLink}>Past paper questions by topic</Link> for every topic. Mark them strictly with the mark scheme.</>],
              ["March to April", "Full timed past papers, two a week per subject. Fix every mistake the same week."],
              ["Exam season", "Last three sessions' papers under exam conditions. Revise only your weakest topics."],
            ]}
          />
          <p className="mt-5 text-lg leading-relaxed text-body">
            The hard part on your own is not finding <Link href="/past-papers" className={inLink}>past papers</Link>. It is knowing why an answer you thought was right only got half the marks.
            Accounting formats, Business evaluation and Economics analysis are where students studying alone lose the most, because nobody marks
            their written answers.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-body">
            To see the marks you need, use the{" "}
            <Link href="/grade-thresholds" className={inLink}>
              official grade thresholds
            </Link>{" "}
            and the{" "}
            <Link href="/tools/grade-predictor" className={inLink}>
              grade predictor
            </Link>
            .
          </p>
        </Section>

        <Section title="Who sits as a private candidate">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>Students whose school does not offer the subject, such as O Level Accounting at a school without a commerce teacher.</li>
            <li>Students taking a gap year, studying at home, or finishing A Levels after leaving school.</li>
            <li>Students retaking a subject to improve a grade for a university or scholarship application.</li>
            <li>Students who want to finish O Levels in fewer years by taking extra subjects alongside school.</li>
          </ul>
        </Section>

        <TrialBox
          from="private-candidates:pakistan"
          classes
          title="No school. Still not alone."
          body="Live small group classes online for O Level, IGCSE, AS and A Level Accounting, Business and Economics, with weekly tests I mark myself. Private candidates are welcome. Start with one free lesson."
        />

        <Section title="Questions private candidates ask">
          <FaqList items={FAQ} />
        </Section>

        <section aria-labelledby="about-guide" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-guide" className="text-sm font-semibold text-muted-foreground">About this guide</h2>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
            Everything you need to enter Cambridge exams without a school: how British Council registration
            works, the deadlines, fees, documents and Statement of Entry, and how to prepare Accounting, Business and Economics on your own.
            In short: yes, you can sit Cambridge exams without a school. In Pakistan you enter as a private candidate through the British
            Council, which registers you and takes your fees. Your registration counts only once your fee is paid by the deadline.
          </p>
        </section>

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Sources:{" "}
          {SOURCES.map((s, i) => (
            <span key={s.href}>
              {i > 0 && ", "}
              <a href={s.href} className={srcLink} rel="noopener">
                {s.label}
              </a>
            </span>
          ))}
          . Fees and dates change each session: always confirm on the British Council page before you pay.
        </p>
      </article>
    </MarketingShell>
  );
}
