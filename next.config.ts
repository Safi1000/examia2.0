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
  // A script rule, watched before it is enforced. "Report-Only" blocks nothing:
  // the browser only reports what WOULD have been blocked to /api/csp-report
  // (it shows in the Vercel logs as "CSP report").
  { key: "Content-Security-Policy-Report-Only", value: scriptPolicy() },
];

/**
 * Where scripts may come from, everything the site really loads:
 * - 'self': the site's own bundles under /_next.
 * - 'unsafe-inline': temporary, and needed for now. Next.js writes a small
 *   inline script per page for its page data (self.__next_f), different on
 *   every page, so hashes can't cover it; the fixed inline scripts (in-app
 *   flag in app/layout.tsx, intro flag in app/page.tsx, the GA and Meta
 *   loaders) rely on it too. Hashes can't be mixed in: once a hash is listed,
 *   browsers ignore 'unsafe-inline' and the page data scripts would break.
 *   Removing it later means nonces from a proxy, which makes every page
 *   render per request (slower, no static pages): a separate decision.
 * - www.googletagmanager.com: Google Analytics (components/GoogleAnalytics.tsx).
 * - connect.facebook.net: the Meta pixel (components/MetaPixel.tsx).
 * - vercel.live: Vercel's toolbar on preview deployments only.
 * JSON-LD blocks (components/JsonLd.tsx) are data, not scripts, so need nothing.
 *
 * Switching it on, after a week with no reports:
 * 1. Search the Vercel logs for "CSP report". Ignore reports from browser
 *    extensions (source starts with chrome-extension:, moz-extension:,
 *    safari-web-extension:) and from `next dev` (eval, local only).
 * 2. Any other report means a real script is missing: add its host here,
 *    then wait another week.
 * 3. When clean, append scriptPolicy(false) to the enforcing
 *    Content-Security-Policy value above (after a "; "), keep this report
 *    only header for a while, deploy, then check by hand: homepage, a past paper page with practice, sign in, a test, the
 *    whiteboard, the console, and the phone app. Watch for analytics and the
 *    Meta pixel still firing (GA Realtime, Meta Events Manager).
 */
function scriptPolicy(report = true) {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://www.googletagmanager.com",
    "https://connect.facebook.net",
    "https://vercel.live",
  ].join(" ");
  return `script-src ${scriptSrc}${report ? "; report-uri /api/csp-report" : ""}`;
}

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
      ...["/admin/:path*", "/admin", "/login", "/dashboard", "/assignments", "/classes", "/tests", "/groundwork", "/progress", "/notes", "/notifications", "/plan", "/settings", "/study", "/more", "/test/:path*", "/results/:path*", "/board-lab/:path*", "/board-lab", "/teach/:path*"].map(
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
