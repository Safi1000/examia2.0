import type { MetadataRoute } from "next";
import { allArticles } from "@/lib/blog";
import { CITY_PAGES } from "@/lib/city-pages";
import { SYLLABI } from "@/lib/syllabus";
import { GULF_CITY_PAGES } from "@/lib/gulf-pages";
import { PAPERS, liveSyllabuses, paperSlug } from "@/lib/mcq-papers";
import { PUBLIC_ROUTES, absolute } from "@/lib/seo";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { PAST_PAPER_SYLLABI, paperHref, papersFor } from "@/lib/past-papers";
import { hasTopical, topicalFor } from "@/lib/topical";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await allArticles();
  return [
    ...PUBLIC_ROUTES.map((r) => ({
      url: absolute(r.path),
      changeFrequency: "monthly" as const,
      priority: r.priority,
    })),
    // One page per syllabus: refreshed when a new session's thresholds are added.
    ...THRESHOLD_PAGES.map((p) => ({
      url: absolute(`/grade-thresholds/${p.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...PAST_PAPER_SYLLABI.map((p) => ({ url: absolute(`/past-papers/${p.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: absolute("/past-papers/search"), changeFrequency: "monthly" as const, priority: 0.6 },
    { url: absolute("/past-papers/topics"), changeFrequency: "monthly" as const, priority: 0.8 },
    ...PAST_PAPER_SYLLABI.filter((s) => hasTopical(s.code)).flatMap((s) => [
      { url: absolute(`/past-papers/${s.slug}/topics`), changeFrequency: "monthly" as const, priority: 0.8 },
      ...topicalFor(s.code)
        .filter((e) => e.questions.length)
        .map((e) => ({ url: absolute(`/past-papers/${s.slug}/topics/${e.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    ]),
    ...PAST_PAPER_SYLLABI.flatMap((s) => papersFor(s.code).map((p) => ({ url: absolute(paperHref(s.slug, p)), changeFrequency: "yearly" as const, priority: 0.6 }))),
    ...SYLLABI.map((s) => ({ url: absolute(`/syllabus/${s.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...[...CITY_PAGES, ...GULF_CITY_PAGES].map((c) => ({
      url: absolute(`/online-classes/${c.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    // The MCQ checker is listed only once it has papers (lib/mcq-papers.ts).
    ...(PAPERS.length ? ["/tools/past-paper-mcq"] : []).map((path) => ({ url: absolute(path), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...liveSyllabuses().map((m) => ({ url: absolute(`/tools/past-paper-mcq/${m.slug}`), changeFrequency: "monthly" as const, priority: 0.5 })),
    ...PAPERS.map((p) => ({ url: absolute(`/tools/past-paper-mcq/${p.syllabus}/${paperSlug(p)}`), changeFrequency: "yearly" as const, priority: 0.4 })),
    ...articles.map((a) => ({
      url: absolute(`/blog/${a.slug}`),
      lastModified: a.updated ?? a.date,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
