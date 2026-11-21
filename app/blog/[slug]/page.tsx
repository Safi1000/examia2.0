import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { ArticleHeader } from "@/components/blog/ArticleHeader";
import { ArticleToc } from "@/components/blog/ArticleToc";
import { AuthorBio } from "@/components/blog/AuthorBio";
import { headingsFromSource } from "@/components/blog/headings";
import { notFound } from "next/navigation";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { SYLLABI } from "@/lib/syllabus";
import { JsonLd } from "@/components/JsonLd";
import { ArticleCta } from "@/components/blog/ArticleCta";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { allArticles, articleSlugs, getArticle } from "@/lib/blog";
import { absolute, articleLd, breadcrumbLd, fitTitle } from "@/lib/seo";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";

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
  const headings = headingsFromSource(fs.readFileSync(path.join(process.cwd(), "content", "blog", `${slug}.mdx`), "utf8"));

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
    // Marks needed for each grade, for the article's first syllabus that has a thresholds page.
    ...THRESHOLD_PAGES.filter((t) => a.code.includes(t.code)).slice(0, 1).map((t) => ({ href: `/grade-thresholds/${t.slug}`, label: `${t.name} grade thresholds` })),
    { href: "/tools/exam-countdown", label: "Exam countdown" },
  ].slice(0, 7);

  return (
    <MarketingShell>
      <JsonLd
        data={articleLd({
          path: `/blog/${slug}`,
          headline: a.title,
          description: a.description,
          datePublished: a.date,
          dateModified: a.updated,
          image: absolute(`/blog/${slug}/opengraph-image`),
          section: a.type,
          about: [a.subject, a.level, a.code],
        })}
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
            <Link href="/" className="transition-colors duration-200 hover:text-ink">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <Link href="/blog" className="transition-colors duration-200 hover:text-ink">The Exam Room</Link>
          </nav>

          <ArticleHeader a={a} />

          <ArticleToc slug={slug} headings={headings} minutes={a.minutes} />


          <div id="article-body" className="pb-2">
            <Post components={{ BookingBox: () => <ArticleCta variant="mid" {...ctaProps} /> }} />
          </div>

          <AuthorBio />

          <ArticleCta variant="end" {...ctaProps} />

          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Want the whole syllabus taught live? See how my{" "}
            <Link href="/online-classes" className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current">
              online classes
            </Link>{" "}
            work, with class times for Pakistan and for{" "}
            <Link href="/online-classes/gulf" className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current">
              students in the Gulf
            </Link>
            .
          </p>

          <nav aria-label="Free for this topic" className="mt-12">
            <p className="text-sm font-semibold text-muted-foreground">Free for this topic</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {resources.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-base font-semibold text-foreground transition-colors duration-200 hover:border-white/[0.28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {related.length > 0 && (
            <nav aria-label="More from The Exam Room" className="mt-16">
              <p className="text-sm font-semibold text-muted-foreground">More on {a.subject}</p>
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/blog/${r.slug}`} className="flex min-h-14 items-center justify-between gap-4 py-4 text-lg font-semibold text-foreground transition-colors duration-200 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                      {r.title} <span aria-hidden className="text-faint">→</span>
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
