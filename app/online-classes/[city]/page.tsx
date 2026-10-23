import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { CITY_PAGES, cityPage } from "@/lib/city-pages";
import { GULF_CITY_PAGES, GULF_SOURCES, GULF_ZONES, gulfCityPage, levelBlocks, shiftHours, type GulfCityPage } from "@/lib/gulf-pages";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { LEVEL_LABEL, span } from "@/lib/timetable";

export const dynamicParams = false;
export function generateStaticParams() {
  return [...CITY_PAGES, ...GULF_CITY_PAGES].map((c) => ({ city: c.slug }));
}

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).city;
  const c = cityPage(slug) ?? gulfCityPage(slug);
  if (!c) return {};
  const url = `/online-classes/${c.slug}`;
  const title = `O Level and A Level Classes in ${c.city}`;
  return {
    title: `${title} | Hamza Teaches`,
    description: c.description,
    alternates: { canonical: url },
    openGraph: { title, description: c.description, url, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title, description: c.description, images: ["/opengraph-image"] },
  };
}

export default async function CityClassesPage({ params }: Props) {
  const slug = (await params).city;
  const gulf = gulfCityPage(slug);
  if (gulf) return <GulfCity c={gulf} />;
  const c = cityPage(slug);
  if (!c) notFound();
  const faq = [
    ...c.faq,
    {
      q: "How do I start?",
      a: "Book the free trial lesson. You join a real class at your level and get the fee for your subjects before you decide.",
    },
  ];
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online-classes" },
          { name: c.city, path: `/online-classes/${c.slug}` },
        ])}
      />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Online classes", href: "/online-classes" }, { name: c.city }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{c.heading}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{c.intro}</p>

        {c.local.map((l) => (
          <Section key={l.title} title={l.title}>
            <p className="text-[17px] leading-relaxed text-body">{l.body}</p>
          </Section>
        ))}

        <Section title="Everything else">
          <p className="text-[17px] leading-relaxed text-body">
            Class times, what is included and the syllabuses covered are on the{" "}
            <Link href="/online-classes" className="text-gold hover:underline">online classes page</Link>. Entering without a school? Read the{" "}
            <Link href="/private-candidates/pakistan" className="text-gold hover:underline">private candidate guide</Link>. Checking your marks?
            Use the <Link href="/grade-thresholds" className="text-gold hover:underline">official grade thresholds</Link>.
          </p>
        </Section>

        <TrialBox from={`city:${c.slug}`} title="Try one class. Then decide." body="Join a real class at your level, free, and see how it works before you decide." />

        <Section title="Questions">
          <FaqList items={faq} />
        </Section>
      </div>
    </MarketingShell>
  );
}

const START_FAQ = {
  q: "How do I start?",
  a: "Book the free trial lesson. You join a real class at your level and get the fee for your subjects before you decide.",
};

/** A Gulf city: local times first, then only what differs in that city. */
function GulfCity({ c }: { c: GulfCityPage }) {
  const zone = GULF_ZONES[c.zone];
  const faq = [...c.faq, START_FAQ];
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online-classes" },
          { name: "Gulf", path: "/online-classes/gulf" },
          { name: c.city, path: `/online-classes/${c.slug}` },
        ])}
      />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs
          trail={[
            { name: "Home", href: "/" },
            { name: "Online classes", href: "/online-classes" },
            { name: "Gulf", href: "/online-classes/gulf" },
            { name: c.city },
          ]}
        />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{c.heading}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{c.intro}</p>

        <Section title={`Class times in ${c.city}`} intro={<p>Monday to Friday, {c.country} time. Each subject is a 40-minute class.</p>}>
          <Table
            caption={`Weekly class times in ${c.city}`}
            head={["Level", `${c.city} time`, "Subjects"]}
            rows={levelBlocks().map((b) => [
              LEVEL_LABEL[b.level],
              span(shiftHours(b.from, zone.behindPk), shiftHours(b.to, zone.behindPk)),
              b.subjects.join(", "),
            ])}
          />
        </Section>

        {c.local.map((l) => (
          <Section key={l.title} title={l.title}>
            <p className="text-[17px] leading-relaxed text-body">{l.body}</p>
          </Section>
        ))}

        <Section title="Everything else">
          <p className="text-[17px] leading-relaxed text-body">
            What is included and the syllabuses covered are on the{" "}
            <Link href="/online-classes/gulf" className="text-gold hover:underline">page for Gulf students</Link>.
            {c.guide && (
              <>
                {" "}Entering without a school? Read the{" "}
                <Link href={c.guide.href} className="text-gold hover:underline">{c.guide.label}</Link>.
              </>
            )}{" "}
            Checking your marks? Use the <Link href="/grade-thresholds" className="text-gold hover:underline">official grade thresholds</Link>.
          </p>
        </Section>

        <TrialBox from={`city:${c.slug}`} title="Your time zone. My class." body="Join a real class at your level, free, and see how it works before you decide." />

        <Section title="Questions">
          <FaqList items={faq} />
        </Section>

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Sources:{" "}
          {c.sources.map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <a href={GULF_SOURCES[k].href} className="hover:text-gold" rel="noopener">
                {GULF_SOURCES[k].label}
              </a>
            </span>
          ))}
          . Rules and dates change: always confirm on the official page.
        </p>
      </div>
    </MarketingShell>
  );
}
