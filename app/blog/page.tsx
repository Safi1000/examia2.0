import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { ArticleList } from "@/components/blog/ArticleList";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { allArticles, formatDate } from "@/lib/blog";
import { breadcrumbLd, fitTitle } from "@/lib/seo";

const title = "The Exam Room: Accounting, Business and Economics Exam Tips";
const description =
  "Explanations, exam technique and past paper walk-throughs for Cambridge and Edexcel O Level, IGCSE and A Level Accounting, Business and Economics.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/blog" },
  openGraph: { title, description, url: "/blog", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

export default async function BlogPage() {
  const articles = await allArticles();
  const dates = Object.fromEntries(articles.map((a) => [a.slug, formatDate(a.date)]));

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "The Exam Room", path: "/blog" },
        ])}
      />
      <section className="pb-20 pt-12 md:pb-28 md:pt-16">
        <div className="mx-auto max-w-6xl px-5">
          <h1 className="text-center text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl">
            The Exam Room
          </h1>
          <div className="mt-10 md:mt-14">
            <ArticleList articles={articles} dates={dates} />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
