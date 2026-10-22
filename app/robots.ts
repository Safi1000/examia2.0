import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** The portal is private: keep crawlers on the public pages only. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/dashboard",
        "/assignments",
        "/classes",
        "/progress",
        "/notes",
        "/notifications",
        "/plan",
        "/settings",
        "/test/",
        "/results/",
        "/board-lab",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
