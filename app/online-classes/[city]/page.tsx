import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { CITY_PAGES, cityPage } from "@/lib/city-pages";
import { breadcrumbLd, faqLd } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return CITY_PAGES.map((c) => ({ city: c.slug }));
}

type Props = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = cityPage((await params).city);
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
  const c = cityPage((await params).city);
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
