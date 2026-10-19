import type { MetadataRoute } from "next";
import { allArticles } from "@/lib/blog";
import { PUBLIC_ROUTES, absolute } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await allArticles();
  return [
    ...PUBLIC_ROUTES.map((r) => ({
      url: absolute(r.path),
      changeFrequency: "monthly" as const,
      priority: r.priority,
    })),
    ...articles.map((a) => ({
      url: absolute(`/blog/${a.slug}`),
      lastModified: a.updated ?? a.date,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
