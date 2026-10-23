import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { GULF_CITY_PAGES, GULF_ZONES, levelBlocks, shiftHours } from "@/lib/gulf-pages";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { LEVEL_LABEL, span } from "@/lib/timetable";

/**
 * Online classes for students in the Gulf. Answers the two questions a Gulf
 * family has (do the times fit school, how do exams work from here) at
 * country level; each city page goes into its own detail, and the
 * private candidate guides carry the full entry process.
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
    q: "Is the timetable in Pakistan time or my time?",
    a: "It is set in Pakistan time, Monday to Friday, 3:30 pm to 9:30 pm. That is 2:30 pm to 8:30 pm in the UAE and Oman, and 1:30 pm to 7:30 pm in Saudi Arabia, Qatar, Kuwait and Bahrain.",
  },
  {
    q: "Where are the fees?",
    a: "They are not on the website, because they depend on your level and how many subjects you take. Message on WhatsApp or book the free trial, and you get the fee for your exact subjects.",
  },
  {
    q: "My school in the Gulf follows Pearson Edexcel. Can I still join?",
    a: "Send your Edexcel specification on WhatsApp before the trial, so I can check it against what I teach and tell you honestly how well the classes match it.",
  },
];

const WEEKS: Array<{ where: string; href: string; week: ReactNode }> = [
  {
    where: "Dubai",
    href: "/online-classes/dubai",
    week: "Private schools run Monday to Friday and finish by 12 pm on Fridays. All five classes fall on school days, and Friday leaves the most time before class.",
  },
  {
    where: "Abu Dhabi",
    href: "/online-classes/abu-dhabi",
    week: "The government works Monday to Friday with a Saturday and Sunday weekend, the same days as the classes. Check your own school's hours against your level's block.",
  },
  {
    where: "Saudi Arabia",
    href: "/online-classes/riyadh",
    week: "The week runs Sunday to Thursday. Four classes fall on school days, Friday's falls on the weekend, and Sunday has no class.",
  },
  {
    where: "Qatar",
    href: "/online-classes/doha",
    week: "Schools run Sunday to Thursday, with a shorter Thursday. The pattern is the same as in Saudi Arabia.",
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
          I teach every class live from Rawalpindi. For a family in the Gulf, the real questions are practical: will the times fit around
          school, and how do the exams work from where you live? This page answers both.
        </p>

        <Section title="The times, in your time zone" intro={<p>Monday to Friday. You join the block for your level.</p>}>
          <div className="space-y-4">
            {GULF_ZONES.map((z) => (
              <div key={z.countries} className="rounded-[16px] border border-hairline bg-card px-5 py-4">
                <p className="font-semibold text-foreground">{z.countries}</p>
                <ul className="mt-3 space-y-1.5 text-[15px] text-body">
                  {blocks.map((b) => (
                    <li key={b.level} className="flex justify-between gap-4">
                      <span>{LEVEL_LABEL[b.level]}</span>
                      <span className="tabular-nums text-muted-foreground">{span(shiftHours(b.from, z.behindPk), shiftHours(b.to, z.behindPk))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Each block is three 40-minute classes, one per subject, back to back. The city pages list every class on your clock.
          </p>
        </Section>

        <Section title="How the classes meet your school week">
          <ul className="space-y-5">
            {WEEKS.map((w) => (
              <li key={w.where} className="text-[17px] leading-relaxed text-body">
                <Link href={w.href} className="font-semibold text-gold hover:underline">
                  {w.where}
                </Link>
                <span className="text-muted-foreground">: </span>
                {w.week}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[17px] leading-relaxed text-body">
            In Oman, Kuwait or Bahrain, the times above are your times. Check them against your school&apos;s own week.
          </p>
        </Section>

        <Section title="Why the recordings matter more abroad">
          <p className="text-[17px] leading-relaxed text-body">
            Gulf school days do not end at the same time as mine start, and in Saudi Arabia and Qatar the A2 block begins at 1:30 pm. Every
            class is recorded and stays open for 24 hours, so a long school day or a family trip costs you a late evening, not a lesson.
            Weekly tests are made and marked by me either way, with written feedback on the answers that lost marks.
          </p>
        </Section>

        <Section title="Exams from where you live">
          <p className="text-[17px] leading-relaxed text-body">
            You sit your exams in the country you live in, not in Pakistan. If your school enters you, it handles everything. If you are
            entering on your own, you go through the British Council in your country, and the rules are not the same everywhere:
          </p>
          <ul className="mt-5 list-disc space-y-3 pl-5 text-[17px] leading-relaxed text-body">
            <li>
              <strong className="text-foreground">UAE:</strong> you need a No Objection Certificate, and the British Council says the
              certificates it issues are not endorsed by the Ministry of Education. Read the{" "}
              <Link href="/private-candidates/uae" className="text-gold hover:underline">UAE guide</Link> before you register.
            </li>
            <li>
              <strong className="text-foreground">Saudi Arabia:</strong> entries go through the British Council offices in Riyadh, Jeddah
              and Al Khobar. See the <Link href="/private-candidates/saudi-arabia" className="text-gold hover:underline">Saudi Arabia guide</Link>.
            </li>
            <li>
              <strong className="text-foreground">Qatar:</strong> if you are under 18, you need a No Objection Letter from the Ministry of
              Education and Higher Education first. The <Link href="/online-classes/doha" className="text-gold hover:underline">Doha page</Link>{" "}
              has the details.
            </li>
          </ul>
        </Section>

        <Section title="Pages for your city">
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

        <TrialBox
          from="online-classes:gulf"
          title="Different country. Same class."
          body="Join one real class at your level, free, in your own time zone. You see a full lesson before you decide anything."
        />

        <Section title="Questions from Gulf families">
          <FaqList items={FAQ} />
        </Section>

        <p className="mt-12 text-sm leading-relaxed text-faint">
          The school week and British Council facts on this page come from official sources, listed on each city page and guide.
        </p>
      </div>
    </MarketingShell>
  );
}
