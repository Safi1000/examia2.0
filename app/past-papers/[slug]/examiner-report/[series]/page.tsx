import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { RelatedLinks, syllabusLinks } from "@/components/study/RelatedLinks";
import { cieCode, pastPaperSyllabus } from "@/lib/past-papers";
import { hasTopical } from "@/lib/topical";
import { absolute, breadcrumbLd, faqLd } from "@/lib/seo";
import {
  EXAMINER_REPORTS,
  EXAMINER_REPORTS_HUB,
  paperHeading,
  reportBySlug,
  reportDescription,
  reportHref,
  reportMonthLabel,
  reportPaperHref,
  reportPapers,
  reportPdf,
  reportSeriesLabel,
  reportSlug,
  reportSyllabus,
  reportTitle,
  reportsFor,
} from "@/lib/examiner-reports";

export const dynamicParams = false;
export function generateStaticParams() {
  return EXAMINER_REPORTS.map((r) => ({ slug: reportSyllabus(r).slug, series: reportSlug(r.series) }));
}

type Props = { params: Promise<{ slug: string; series: string }> };

async function load(params: Props["params"]) {
  const { slug, series } = await params;
  const s = pastPaperSyllabus(slug);
  const r = s ? reportBySlug(s, series) : null;
  return s && r ? { s, r } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await load(params);
  if (!x) return {};
  const title = reportTitle(x.r);
  const description = reportDescription(x.r);
  const url = reportHref(x.r);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: ["/opengraph-image"] },
  };
}

const link =
  "font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground marker:text-faint">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function ExaminerReportPage({ params }: Props) {
  const x = await load(params);
  if (!x) notFound();
  const { s, r } = x;
  const url = reportHref(r);
  const label = reportSeriesLabel(r.series);
  const pdf = reportPdf(r);
  const others = reportsFor(s.code).filter((o) => o.series !== r.series);
  const topical = hasTopical(s.code);
  const crumb = `Examiner report ${reportMonthLabel(r.series)}`;

  const faq = [
    {
      q: `What is the ${s.code} examiner report?`,
      a: `After every series, the senior examiners for ${s.name} write a report on how candidates answered each paper: what earned marks and where marks were lost. This page is my plain summary of the ${label} report, paper by paper.`,
    },
    ...(pdf
      ? [
          {
            q: "Where is the full report?",
            a: `The original Cambridge report for ${label} is free on this site, with the question papers and mark schemes for the same series on the ${s.short} past papers page.`,
          },
        ]
      : []),
    {
      q: "How should I use an examiner report?",
      a: "Sit the paper first, timed. Mark it with the mark scheme. Then read what the examiners said about each question you lost marks on. The mistakes they list are the ones many candidates make, so fixing them is one of the fastest ways to pick up marks.",
    },
  ];

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: reportTitle(r),
          description: reportDescription(r),
          url: absolute(url),
          inLanguage: "en",
          isAccessibleForFree: true,
          about: `${s.name} ${label} examiner report`,
          author: { "@type": "Person", name: "Hamza", url: absolute("/") },
          publisher: { "@type": "Organization", name: "Hamza Teaches", url: absolute("/") },
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: s.name, path: `/past-papers/${s.slug}` },
          { name: crumb, path: url },
        ])}
      />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-8 md:pt-12">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: s.short, href: `/past-papers/${s.slug}` }, { name: crumb }]} />
        <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">
          {s.code} examiner report, {label}
        </h1>
        {s.next && (
          <p className="mt-4 text-base leading-relaxed text-body">
            From {s.next.from} this syllabus becomes {s.next.code}.          </p>
        )}

        <nav aria-label="Papers in this report" className="mt-6 flex flex-wrap gap-2">
          {r.papers.map((p, i) => (
            <a key={i} href={`#paper-${i + 1}`} className="inline-flex min-h-11 items-center rounded-full border border-hairline px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-card-raised">
              {p.variants.length === 1 ? `Paper ${p.variants[0]}` : `Papers ${p.variants.join(" and ")}`}
            </a>
          ))}
        </nav>

        <Section title="What to fix first">
          <ul className="list-disc space-y-3 pl-5 text-lg leading-relaxed text-body marker:text-faint">
            {r.takeaways.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {r.quote && (
            <blockquote className="mt-8 border-l-2 border-gold pl-5 text-lg leading-relaxed text-foreground">
              &ldquo;{r.quote.text}&rdquo;
              <footer className="mt-1 text-sm text-faint">The examiners, {label} report</footer>
            </blockquote>
          )}
        </Section>

        {r.papers.map((p, i) => {
          const papers = reportPapers(r, p);
          return (
            <Section key={i} id={`paper-${i + 1}`} title={paperHeading(p)}>
              <div className="grid gap-8 md:grid-cols-2">
                <List title="What candidates did well" items={p.well} />
                <List title="Most common mistakes" items={p.mistakes} />
              </div>
              <div className="mt-8">
                <List title="What to do instead" items={p.fix} />
              </div>

              {p.questions.length > 0 && (
                <div className="mt-10">
                  <h3 className="text-base font-semibold text-foreground">Question by question</h3>
                  <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                    {p.questions.map((q) => (
                      <li key={q.q + q.topic} className="py-5">
                        <p className="text-base font-semibold text-foreground">
                          <span className="tabular-nums">Question {q.q}</span>
                          <span className="font-normal text-muted-foreground">, {q.topic}</span>
                        </p>
                        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                          <span className="font-semibold text-foreground">Where marks went: </span>
                          {q.issue}
                        </p>
                        <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                          <span className="font-semibold text-foreground">Do this: </span>
                          {q.fix}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {papers.length > 0 && (
                <div className="mt-8 rounded-tile border border-hairline bg-card-raised p-5">
                  <h3 className="text-base font-semibold text-foreground">How to use this</h3>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                    Sit{" "}
                    {papers.map((pp, j) => (
                      <span key={pp.key}>
                        {j > 0 && (j === papers.length - 1 ? " or " : ", ")}
                        <Link href={reportPaperHref(r, pp)} className={link}>
                          {cieCode(pp)}
                        </Link>
                      </span>
                    ))}{" "}
                    timed, mark it with the mark scheme, then check every lost mark against the points above.
                    {topical && (
                      <>
                        {" "}
                        For more practice on a weak topic,{" "}
                        <Link href={`/past-papers/${s.slug}/topics`} className={link}>
                          revise {s.code} questions by topic
                        </Link>
                        .
                      </>
                    )}
                  </p>
                </div>
              )}
            </Section>
          );
        })}

        <TrialBox
          from={`examiner-report:${s.code}_${r.series}`}
          classes
          subject={s.subject}
          level={s.trialLevel}
          title="Want these mistakes gone before your exam?"
          body={`That is what I fix in class: the exact ${s.short} questions students keep dropping marks on, with the mark scheme open. Start with one free lesson.`}
        />

        {others.length > 0 && (
          <Section title={`Other ${s.code} examiner reports`}>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {others.map((o) => (
                <li key={o.series}>
                  <Link href={reportHref(o)} className="flex min-h-12 items-center py-3 text-lg font-semibold text-foreground underline-offset-4 hover:underline">
                    {s.code} examiner report, {reportSeriesLabel(o.series)}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <RelatedLinks
          links={[{ href: EXAMINER_REPORTS_HUB, label: "Examiner reports for every syllabus" }, ...syllabusLinks(s.code)]}
          className="mt-16 max-w-[70ch]"
        />

        <section aria-labelledby="about-er" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-er" className="text-sm font-semibold text-muted-foreground">
            About this page
          </h2>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-faint">
            This is my summary of the Cambridge examiner report for {s.name}, {label}, written in my own words for students. It covers {r.papers.length}{" "}
            {r.papers.length === 1 ? "paper section" : "paper sections"}: what candidates did well, the most common mistakes and what to do instead, question by question.
            {s.next ? ` From ${s.next.from} this syllabus becomes ${s.next.code}.` : ""}
            {pdf && (
              <>
                {" "}
                Read the{" "}
                <a href={pdf} target="_blank" rel="noopener" className={link}>
                  full Cambridge report
                </a>{" "}
                for the complete detail.
              </>
            )}
          </p>
        </section>

        <Section title="Questions students ask">
          <dl className="space-y-6">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-1.5 text-lg leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className="mt-12 text-sm text-faint">
          Examiner reports are © Cambridge University Press &amp; Assessment. This page is an independent summary for revision.
        </p>
      </div>
    </MarketingShell>
  );
}
