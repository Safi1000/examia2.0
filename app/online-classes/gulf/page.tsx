import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { GULF_CITY_PAGES, GULF_ZONES, levelBlocks, shiftHours } from "@/lib/gulf-pages";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { LEVEL_LABEL, span } from "@/lib/timetable";

/**
 * Online classes for students in the Gulf. Same classes as /online-classes,
 * so this page only carries what differs for a Gulf family: the times on
 * their own clock. Country and city facts (school week, private candidate
 * entry) live on the city pages and the private candidate guides.
 */
const title = "Online O Level and A Level Classes for Gulf Students";
const description =
  "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for students in the UAE, Saudi Arabia, Qatar, Oman, Kuwait and Bahrain.";

export const metadata: Metadata = {
  title: `${title} | Hamza Teaches`,
  description,
  alternates: { canonical: "/online-classes/gulf" },
  openGraph: { title, description, url: "/online-classes/gulf", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Are the class times in Pakistan time or my time?",
    a: "The timetable is set in Pakistan time, Monday to Friday, 3:30 pm to 9:30 pm. That is 2:30 pm to 8:30 pm in the UAE and Oman, and 1:30 pm to 7:30 pm in Saudi Arabia, Qatar, Kuwait and Bahrain. The table on this page shows each class in your time.",
  },
  {
    q: "How much are the classes?",
    a: "Fees depend on your level and how many subjects you take. Book the free trial lesson or message on WhatsApp and you get the exact fee for your subjects.",
  },
  {
    q: "Do you teach Cambridge or Edexcel?",
    a: "Both. The Cambridge syllabuses are O Level 7707, 7115 and 2281, IGCSE 0452, 0450 and 0455, and AS and A Level 9706, 9609 and 9708. For Pearson Edexcel, send your specification on WhatsApp before the trial.",
  },
  {
    q: "What if a class clashes with something at school?",
    a: "Every class is recorded, and the recording stays open for 24 hours, so you can catch up the same evening.",
  },
];

export default function OnlineClassesGulf() {
  const blocks = levelBlocks();
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online-classes" },
          { name: "Gulf", path: "/online-classes/gulf" },
        ])}
      />
      <JsonLd data={faqLd(FAQ)} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Online classes", href: "/online-classes" }, { name: "Gulf" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          O Level and A Level Accounting, Business and Economics classes for students in the Gulf
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          I teach from Rawalpindi, and students in the UAE, Saudi Arabia, Qatar, Oman, Kuwait and Bahrain join the same live classes as
          students in Pakistan. The classes fall in your afternoon and early evening, after school, at home.
        </p>

        <Section title="Class times in your time zone" intro={<p>Monday to Friday. Each subject is a 40-minute class.</p>}>
          <Table
            caption="Weekly class times in Gulf time"
            head={["Level", ...GULF_ZONES.map((z) => z.countries), "Subjects"]}
            rows={blocks.map((b) => [
              LEVEL_LABEL[b.level],
              ...GULF_ZONES.map((z) => span(shiftHours(b.from, z.behindPk), shiftHours(b.to, z.behindPk))),
              b.subjects.join(", "),
            ])}
          />
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            In Pakistan time, the same classes run from 3:30 pm to 9:30 pm.
          </p>
        </Section>

        <Section title="What you get">
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-body">
            <li>Live small-group classes five days a week, the full syllabus plus past papers.</li>
            <li>A recording of every class, open for 24 hours.</li>
            <li>Weekly tests made and marked by me, with written feedback.</li>
            <li>A direct line to me for questions between classes.</li>
          </ul>
        </Section>

        <Section title="Classes for your city">
          <ul className="grid gap-3 sm:grid-cols-3">
            {GULF_CITY_PAGES.map((c) => (
              <li key={c.slug}>
                <Link href={`/online-classes/${c.slug}`} className="block rounded-[16px] border border-hairline bg-card px-5 py-4 text-foreground hover:border-gold-border">
                  {c.city}
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Private candidates">
          <p className="text-[17px] leading-relaxed text-body">
            Entering without a school? Read the{" "}
            <Link href="/private-candidates/uae" className="text-gold hover:underline">UAE guide</Link> or the{" "}
            <Link href="/private-candidates/saudi-arabia" className="text-gold hover:underline">Saudi Arabia guide</Link>.
          </p>
        </Section>

        <Section title="Free study tools">
          <ul className="space-y-2 text-[17px]">
            <li>
              <Link href="/grade-thresholds" className="text-gold hover:underline">Official grade thresholds</Link>{" "}
              <span className="text-muted-foreground">for every syllabus and variant.</span>
            </li>
            <li>
              <Link href="/tools/grade-predictor" className="text-gold hover:underline">Grade predictor</Link>{" "}
              <span className="text-muted-foreground">for your mock marks.</span>
            </li>
            <li>
              <Link href="/blog" className="text-gold hover:underline">The Exam Room</Link>{" "}
              <span className="text-muted-foreground">for topic guides and exam technique.</span>
            </li>
          </ul>
        </Section>

        <TrialBox
          from="online-classes:gulf"
          title="Different country. Same class."
          body="Join a real class at your level, free, in your own time zone, and see how it works before you decide."
        />

        <Section title="Questions">
          <FaqList items={FAQ} />
        </Section>
      </div>
    </MarketingShell>
  );
}
