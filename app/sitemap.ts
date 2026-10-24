import type { MetadataRoute } from "next";
import { allArticles } from "@/lib/blog";
import { CITY_PAGES } from "@/lib/city-pages";
import { SYLLABI } from "@/lib/syllabus";
import { GULF_CITY_PAGES } from "@/lib/gulf-pages";
import { PAPERS, liveSyllabuses, paperSlug } from "@/lib/mcq-papers";
import { PUBLIC_ROUTES, absolute } from "@/lib/seo";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";

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
