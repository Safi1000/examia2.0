import type { NextConfig } from "next";
import createMDX from "@next/mdx";

/**
 * Sent with every response. Kept compatible with what the site embeds
 * (YouTube, Vimeo, Google Drive, the Meta pixel, Cloudinary, Supabase), so
 * this is not a full content-security policy: it blocks framing by other
 * sites, plugins and form posts elsewhere, and MIME sniffing.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://www.facebook.com; upgrade-insecure-requests",
  },
];

const nextConfig: NextConfig = {
  // Articles live in content/blog/*.mdx and are imported by app/blog/[slug].
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private pages: never stored by shared caches.
      { source: "/reports/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // The portal never appears in search results, even if a link leaks.
      ...["/admin/:path*", "/admin", "/login", "/dashboard", "/assignments", "/classes", "/progress", "/notes", "/notifications", "/plan", "/settings", "/test/:path*", "/results/:path*", "/board-lab/:path*", "/board-lab"].map(
        (source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }),
      ),
    ];
  },
};

// Plugins by name (string) so they work with Turbopack. remark-gfm adds tables.
const withMDX = createMDX({
  options: { remarkPlugins: ["remark-gfm"] },
});

export default withMDX(nextConfig);
