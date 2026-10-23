import type { MetadataRoute } from "next";
import { allArticles } from "@/lib/blog";
import { CITY_PAGES } from "@/lib/city-pages";
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
    ...CITY_PAGES.map((c) => ({
      url: absolute(`/online-classes/${c.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...articles.map((a) => ({
      url: absolute(`/blog/${a.slug}`),
      lastModified: a.updated ?? a.date,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
