import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { FaqList, MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { WaitlistBox } from "@/components/tools/WaitlistBox";
import { absolute, breadcrumbLd, faqLd } from "@/lib/seo";
import type { LevelName, SubjectName } from "@/lib/landing";

/** The page around every free calculator: heading, the tool, how it works, questions, the ask. */
export function ToolShell({
  slug,
  name,
  h1,
  intro,
  children,
  how,
  faq,
  related,
  subject,
  level,
}: {
  slug: string;
  name: string;
  h1: string;
  intro: string;
  children: ReactNode;
  how: ReactNode;
  faq: Array<{ q: string; a: string }>;
  related?: Array<{ href: string; label: string }>;
  subject: SubjectName;
  level: LevelName;
}) {
  const path = `/tools/${slug}`;
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name, path }])} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name,
          url: absolute(path),
          applicationCategory: "EducationalApplication",
          operatingSystem: "Any",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{h1}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{intro}</p>
        <div className="mt-10">{children}</div>
        <Section title="How it works">{how}</Section>
        <TrialBox
          from={`tool:${slug}`}
          subject={subject}
          level={level}
          title="Know the formula. Win the marks."
          body="The calculation is half the marks. The other half is explaining what it means, which is what my classes drill every week. Start with one free lesson."
        />
        <Section title="Questions students ask">
          <FaqList items={faq} />
        </Section>
        <WaitlistBox source={path} />
        {related && related.length > 0 && (
          <Section title="Read next">
            <ul className="space-y-2 text-[17px]">
              {related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="text-gold hover:underline">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </MarketingShell>
  );
}
