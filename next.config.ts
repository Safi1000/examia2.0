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
  // Video posters come from YouTube at full size; resized and converted here instead.
  images: { remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }] },
  // Past papers (PDFs and page images) live in Cloudflare R2 (bucket "pastpapers");
  // they are served from this site's own address so search engines credit
  // hamzateaches.com. PAPER_FILES_ORIGIN overrides it (local testing).
  async rewrites() {
    const origin = (process.env.PAPER_FILES_ORIGIN || "https://pub-68aedf85fa834c318cbe7828a6d29c25.r2.dev").replace(/\/$/, "");
    return [{ source: "/papers/:path*", destination: `${origin}/:path*` }];
  },
  // Starting Points was removed: old links go to the homepage.
  async redirects() {
    return [
      // Practice was folded into Topics.
      { source: "/past-papers/practice", destination: "/past-papers/topics", permanent: true },
      { source: "/past-papers/:slug/practice", destination: "/past-papers/:slug/topics", permanent: true },
      ...["/check", "/check/:path*", "/starting-point", "/starting-point/:path*", "/admin/starting-points"].map((source) => ({ source, destination: source.startsWith("/admin") ? "/admin" : "/", permanent: false })),
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Raw paper files: Google should send people to the paper's page (with
      // the viewer and practice), not straight to a bare PDF or image.
      { source: "/papers/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // Private pages: never stored by shared caches.
      { source: "/reports/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // The portal never appears in search results, even if a link leaks.
      ...["/admin/:path*", "/admin", "/login", "/dashboard", "/assignments", "/classes", "/tests", "/groundwork", "/progress", "/notes", "/notifications", "/plan", "/settings", "/test/:path*", "/results/:path*", "/board-lab/:path*", "/board-lab", "/teach/:path*"].map(
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
