import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
        <div className="mx-auto max-w-3xl px-5">
          <nav aria-label="Breadcrumb" className="text-sm text-faint">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <Link href="/blog" className="hover:text-gold">The Exam Room</Link>
          </nav>

          <header className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
              {a.subject} · {a.level} · {a.type}
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{a.title}</h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{a.description}</p>
            <p className="mt-6 border-b border-hairline pb-8 text-sm text-faint">
              By Hamza · {formatDate(a.updated ?? a.date)} · {a.minutes} min read · <span className="tabular-nums">{a.code}</span>
            </p>
          </header>

          <div className="pb-2">
            <Post components={{ BookingBox: () => <ArticleCta variant="mid" {...ctaProps} /> }} />
          </div>

          <ArticleCta variant="end" {...ctaProps} />

          {related.length > 0 && (
            <nav aria-label="More from The Exam Room" className="mt-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-faint">More on {a.subject}</p>
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/blog/${r.slug}`} className="flex min-h-14 items-center justify-between gap-4 py-4 text-[17px] font-semibold text-foreground hover:text-gold">
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
