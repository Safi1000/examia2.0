import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { RelatedLinks } from "@/components/study/RelatedLinks";
import { BOARDS_LINE, COUNTRY_SOURCES, countryServiceLd, localDayAhead, type CountryPage } from "@/lib/country-pages";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

const link = "text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";

export function countryMetadata(c: CountryPage): Metadata {
  const url = `/online-classes/${c.slug}`;
  return {
    title: fitTitle(c.title),
    description: c.description,
    alternates: { canonical: url },
    openGraph: { title: c.title, description: c.description, url, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title: c.title, description: c.description, images: ["/opengraph-image"] },
  };
}

/**
 * Online classes for students in one country outside Pakistan and the Gulf:
 * the day on the local clock first, then how the classes work from there,
 * the exams as official sources describe them, and how private candidates
 * enter. No proof from that country is shown, because none exists yet.
 */
export function CountryClasses({ c }: { c: CountryPage }) {
  const path = `/online-classes/${c.slug}`;
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Online classes", path: "/online-classes" },
          { name: c.country, path },
        ])}
      />
      <JsonLd data={countryServiceLd(c)} />
      <JsonLd data={faqLd(c.faq)} />
      <div className="public-calm mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Online classes", href: "/online-classes" }, { name: c.country }]} />
        <h1 className="mt-8 text-title leading-[1.1] sm:text-title-lg">{c.heading}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{c.intro}</p>

        <Section
          title={`The day's classes in ${c.clock} time`}
          intro={<p>Monday to Friday. Each class is 40 minutes, and you join the three in your level&apos;s block.</p>}
        >
          <div className="space-y-4">
            {localDayAhead(c.aheadMin).map((d) => (
              <div key={d.level} className="pc-surface rounded-tile px-5 py-4">
                <p className="font-semibold text-foreground">
                  {d.level} <span className="font-normal text-muted-foreground">· {d.time}</span>
                </p>
                <ul className="mt-3 space-y-1.5 text-base text-body">
                  {d.classes.map((k) => (
                    <li key={k.subject} className="flex justify-between gap-4">
                      <span>{k.subject}</span>
                      <span className="tabular-nums text-muted-foreground">{k.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {c.timeNotes.map((n) => (
            <p key={n.slice(0, 32)} className="mt-4 text-base leading-relaxed text-muted-foreground">
              {n}
            </p>
          ))}
        </Section>

        <Section title={`How the classes work from ${c.country}`}>
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            <li>Live classes on Google Meet, Monday to Friday: the full syllabus plus past papers.</li>
            <li>A recording of every class, open for 48 hours, for the days when school or a time zone gets in the way.</li>
            <li>Weekly tests made and marked by me, with written feedback on the answers that lost marks.</li>
            <li>A dedicated past paper window in March and April, before May / June exams.</li>
            <li>A direct line to me for questions between classes.</li>
          </ul>
        </Section>

        <Section title="The exams I teach for">
          <div className="space-y-4 text-lg leading-relaxed text-body">
            {c.exams.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
            <p>{BOARDS_LINE}</p>
          </div>
        </Section>

        <Section title={`Sitting exams from ${c.country}`}>
          <div className="space-y-4 text-lg leading-relaxed text-body">
            <p>You sit your exams in the country you live in. If your school enters you, it handles everything.</p>
            {c.privateCandidates.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
            <p>
              Official {c.pcLinks.length > 1 ? "pages" : "page"}:{" "}
              {c.pcLinks.map((k, i) => (
                <span key={k}>
                  {i > 0 && " and "}
                  <a href={COUNTRY_SOURCES[k].href} className={link} rel="noopener">
                    {COUNTRY_SOURCES[k].label}
                  </a>
                </span>
              ))}
              .
            </p>
          </div>
        </Section>

        <TrialBox from={`online-classes:${c.slug}`} title={c.trial.title} body={c.trial.body} />

        <Section title={`Questions from ${c.country}`}>
          <FaqList items={c.faq} />
        </Section>

        <p className="mt-12 text-lg leading-relaxed text-body">
          The same classes, with times for Pakistan, are on the{" "}
          <Link href="/online-classes" className={link}>online classes page</Link>.
        </p>

        <RelatedLinks
          links={[
            { href: "/past-papers", label: "Past papers with mark schemes" },
            { href: "/past-papers/topics", label: "Past paper questions by topic" },
            { href: "/syllabus", label: "Cambridge syllabus checklists" },
            { href: "/grade-thresholds", label: "Cambridge grade thresholds" },
          ]}
        />

        <p className="mt-8 text-sm leading-relaxed text-faint">
          Sources:{" "}
          {c.sources.map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <a href={COUNTRY_SOURCES[k].href} className="underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:text-muted-foreground" rel="noopener">
                {COUNTRY_SOURCES[k].label}
              </a>
            </span>
          ))}
          . Rules and dates change: always confirm on the official page.
        </p>
      </div>
    </MarketingShell>
  );
}
