import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { CITY_PAGES } from "@/lib/city-pages";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { DEFAULT_SCHEDULE, LEVEL_LABEL, span, type LevelKey } from "@/lib/timetable";

const title = "Online O Level and A Level Classes in Pakistan";
const description =
  "Live online classes for Cambridge O Level, IGCSE, AS and A Level Accounting, Business and Economics in Pakistan. Small groups, recorded lessons, free trial.";

export const metadata: Metadata = {
  title: `${title} | Hamza Teaches`,
  description,
  alternates: { canonical: "/online-classes" },
  openGraph: { title, description, url: "/online-classes", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "How much are the classes?",
    a: "Fees depend on your level and how many subjects you take. Book the free trial lesson or message on WhatsApp and you get the exact fee for your subjects.",
  },
  {
    q: "Do you teach Cambridge or Edexcel?",
    a: "Both. The Cambridge syllabuses are O Level 7707, 7115 and 2281, IGCSE 0452, 0450 and 0455, and AS and A Level 9706, 9609 and 9708. For Pearson Edexcel, send your specification on WhatsApp before the trial.",
  },
  {
    q: "What happens in the free trial lesson?",
    a: "You join a real class at your level, see how lessons and tests work, and ask anything before you decide.",
  },
  {
    q: "Can private candidates join?",
    a: "Yes. Many private candidates have no teacher to mark their written answers, which is exactly what the weekly tests are for.",
  },
];

/** The weekly blocks per level, from the standard timetable. */
function blocks() {
  const order: LevelKey[] = ["A2", "O", "AS"];
  return order.map((level) => {
    const slots = DEFAULT_SCHEDULE.slots.filter((s) => s.level === level).sort((a, b) => a.start.localeCompare(b.start));
    return { level, from: slots[0]?.start ?? "", to: slots[slots.length - 1]?.end ?? "", subjects: slots.map((s) => s.subject) };
  });
}

export default function OnlineClassesPakistan() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Online classes", path: "/online-classes" }])} />
      <JsonLd data={faqLd(FAQ)} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Online classes" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Online O Level and A Level classes in Accounting, Business and Economics
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Live small-group classes for Cambridge O Level, IGCSE, AS and A Level students across Pakistan. Every lesson is recorded, and
          every weekly test is made and marked by me, with feedback on the exact mistakes that cost you marks.
        </p>

        <Section title="What you get">
          <ul className="list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-body">
            <li>Live classes five days a week, the full syllabus plus past papers.</li>
            <li>A recording of every class, open for 24 hours.</li>
            <li>Weekly tests made and marked by me, with written feedback.</li>
            <li>A dedicated past paper window in March and April, before May / June exams.</li>
            <li>A direct line to me for questions between classes.</li>
          </ul>
        </Section>

        <Section title="Class times" intro={<p>Monday to Friday, Pakistan time. Each subject is a 40-minute class.</p>}>
          <Table
            caption="Weekly class times"
            head={["Level", "Time", "Subjects"]}
            rows={blocks().map((b) => [LEVEL_LABEL[b.level], span(b.from, b.to), b.subjects.join(", ")])}
          />
        </Section>

        <Section title="Classes for your city">
          <ul className="grid gap-3 sm:grid-cols-3">
            {CITY_PAGES.map((c) => (
              <li key={c.slug}>
                <Link href={`/online-classes/${c.slug}`} className="block rounded-[16px] border border-hairline bg-card px-5 py-4 text-foreground hover:border-gold-border">
                  {c.city}
                </Link>
              </li>
            ))}
          </ul>
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
              <Link href="/private-candidates/pakistan" className="text-gold hover:underline">Private candidate guide</Link>{" "}
              <span className="text-muted-foreground">for entering without a school.</span>
            </li>
            <li>
              <Link href="/blog" className="text-gold hover:underline">The Exam Room</Link>{" "}
              <span className="text-muted-foreground">for topic guides and exam technique.</span>
            </li>
          </ul>
        </Section>

        <TrialBox
          from="online-classes"
          title="Try one class. Then decide."
          body="Join a real class at your level, free, and see how it works before you decide."
        />

        <Section title="Questions">
          <FaqList items={FAQ} />
        </Section>
      </div>
    </MarketingShell>
  );
}
