import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { SYLLABI } from "@/lib/syllabus";
import { JsonLd } from "@/components/JsonLd";
import { ArticleCta } from "@/components/blog/ArticleCta";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { allArticles, articleSlugs, formatDate, getArticle } from "@/lib/blog";
import { COMPANY_NAME } from "@/lib/config";
import { absolute, breadcrumbLd, PERSON_ID, fitTitle } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return articleSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  if (!a) return {};
  const url = `/blog/${a.slug}`;
  return {
    title: fitTitle(a.seoTitle ?? a.title),
    description: a.description,
    alternates: { canonical: url },
    openGraph: {
      title: a.title,
      description: a.description,
      url,
      type: "article",
      publishedTime: a.date,
      modifiedTime: a.updated ?? a.date,
    },
    twitter: { card: "summary_large_image", title: a.title, description: a.description },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) notFound();

  const { default: Post } = await import(`@/content/blog/${slug}.mdx`);
  // Short topic for the WhatsApp message: the title before any bracket or colon.
  const topic = a.title.split(/[(:]/)[0].trim().toLowerCase();
  const ctaProps = { slug, topic, subject: a.subject, level: a.level };

  const related = (await allArticles()).filter((o) => o.slug !== slug && o.subject === a.subject).slice(0, 2);
  // Free resources for this article: its calculator (by topic) and past papers for its codes.
  const toolFor: Array<[RegExp, string, string]> = [
    [/depreciation/, "/tools/depreciation-calculator", "Depreciation calculator"],
    [/investment-appraisal/, "/tools/investment-appraisal-calculator", "Investment appraisal calculator"],
    [/elasticity/, "/tools/elasticity-calculator", "Elasticity calculator"],
    [/break-even/, "/tools/break-even-calculator", "Break-even calculator"],
    [/accounting-formats|trial-balance|ratio/, "/tools/ratio-calculator", "Accounting ratio calculator"],
    [/grade-thresholds|a-star|marks/, "/tools/grade-predictor", "Grade predictor"],
  ];
  const resources = [
    ...toolFor.filter(([re]) => re.test(slug)).map(([, href, label]) => ({ href, label })),
    ...PAST_PAPER_SYLLABI.filter((p) => a.code.includes(p.code) || (p.next && a.code.includes(p.next.code))).flatMap((p) => [
      { href: `/past-papers/${p.slug}/topics`, label: `${p.name} questions by topic` },
      { href: `/past-papers/${p.slug}`, label: `${p.name} past papers` },
    ]),
    // The checklist for the article's first syllabus: what the syllabus asks, point by point.
    ...SYLLABI.filter((x) => a.code.includes(x.code)).slice(0, 1).map((x) => ({ href: `/syllabus/${x.slug}`, label: `${x.name} syllabus checklist` })),
    { href: "/tools/exam-countdown", label: "Exam countdown" },
  ].slice(0, 6);

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.description,
          datePublished: a.date,
          dateModified: a.updated ?? a.date,
          url: absolute(`/blog/${slug}`),
          image: absolute(`/blog/${slug}/opengraph-image`),
          inLanguage: "en",
          about: [a.subject, a.level, a.code],
          author: { "@type": "Person", "@id": PERSON_ID, name: "Hamza Sadaqat", url: absolute("/") },
          publisher: { "@id": `${absolute("/")}/#organization`, "@type": "EducationalOrganization", name: COMPANY_NAME },
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "The Exam Room", path: "/blog" },
          { name: a.title, path: `/blog/${slug}` },
        ])}
      />

      <article className="pb-20 pt-14 md:pb-28 md:pt-20">
        <div className="mx-auto max-w-[38rem] px-5 md:max-w-[40rem]">
          <nav aria-label="Breadcrumb" className="text-sm text-faint">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <Link href="/blog" className="hover:text-gold">The Exam Room</Link>
          </nav>

          <header className="mt-8">
            <p className="text-[14px] font-semibold text-gold">
              {a.subject} · {a.level} · {a.type}
            </p>
            <h1 className="mt-4 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-[2.875rem]">{a.title}</h1>
            <p className="mt-6 text-[19px] leading-relaxed text-muted-foreground">{a.description}</p>
            <p className="mt-6 border-b border-hairline pb-8 text-sm text-faint">
              By Hamza · {formatDate(a.updated ?? a.date)} · {a.minutes} min read · <span className="tabular-nums">{a.code}</span>
            </p>
          </header>

          <div className="pb-2">
            <Post components={{ BookingBox: () => <ArticleCta variant="mid" {...ctaProps} /> }} />
          </div>

          <ArticleCta variant="end" {...ctaProps} />

          <nav aria-label="Free for this topic" className="mt-12">
            <p className="text-[14px] font-semibold text-muted-foreground">Free for this topic</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {resources.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {related.length > 0 && (
            <nav aria-label="More from The Exam Room" className="mt-16">
              <p className="text-[14px] font-semibold text-muted-foreground">More on {a.subject}</p>
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/blog/${r.slug}`} className="flex min-h-14 items-center justify-between gap-4 py-4 text-[17px] font-semibold text-foreground transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                      {r.title} <span aria-hidden className="text-gold">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </article>
    </MarketingShell>
  );
}
